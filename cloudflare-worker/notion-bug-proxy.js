/**
 * Sidekick Notion Bug Proxy
 *
 * Required Worker secrets:
 *   NOTION_API_KEY
 *   NOTION_DATABASE_ID
 */

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
};

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
    });
}

function richText(content) {
    return [{ type: 'text', text: { content: String(content || '').slice(0, 2000) } }];
}

function chunkText(value, size = 1900) {
    const text = String(value || '');
    const chunks = [];
    for (let index = 0; index < text.length; index += size) chunks.push(text.slice(index, index + size));
    return chunks.length ? chunks : [''];
}

function findProperty(schema, wantedName, wantedTypes) {
    const lowerName = wantedName.toLowerCase();
    return Object.entries(schema || {}).find(([name, definition]) =>
        name.toLowerCase() === lowerName && wantedTypes.includes(definition.type)
    );
}

async function notionRequest(path, env, init = {}) {
    const response = await fetch(`https://api.notion.com/v1${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${env.NOTION_API_KEY}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json',
            ...(init.headers || {})
        }
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = body.message || body.code || `Notion request failed (${response.status})`;
        throw new Error(message);
    }
    return body;
}

async function submitBugReport(request, env) {
    if (!env.NOTION_API_KEY || !env.NOTION_DATABASE_ID) {
        return json({ error: 'NOTION_NOT_CONFIGURED', message: 'Worker Notion secrets are not configured.' }, 503);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'INVALID_JSON', message: 'Request body must be valid JSON.' }, 400);
    }

    const title = String(body.title || 'Sidekick Bug Report').trim().slice(0, 2000);
    const description = String(body.description || 'No description provided');
    const priority = String(body.priority || 'Medium').slice(0, 100);
    const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};
    const screenshot = typeof body.screenshot === 'string' ? body.screenshot : '';

    const database = await notionRequest(`/databases/${encodeURIComponent(env.NOTION_DATABASE_ID)}`, env);
    const schema = database.properties || {};
    const titleEntry = Object.entries(schema).find(([, definition]) => definition.type === 'title');
    if (!titleEntry) throw new Error('The configured Notion database has no title property.');

    const properties = {
        [titleEntry[0]]: { title: richText(title) }
    };

    const priorityEntry = findProperty(schema, 'Priority', ['select', 'rich_text']);
    if (priorityEntry) {
        const [name, definition] = priorityEntry;
        if (definition.type === 'select') properties[name] = { select: { name: priority } };
        else properties[name] = { rich_text: richText(priority) };
    }

    const descriptionEntry = findProperty(schema, 'Description', ['rich_text']);
    if (descriptionEntry) properties[descriptionEntry[0]] = { rich_text: richText(description) };

    const children = chunkText(description).map(content => ({
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: richText(content) }
    }));

    if (Object.keys(metadata).length) {
        children.push({
            object: 'block',
            type: 'heading_2',
            heading_2: { rich_text: richText('Technical details') }
        });
        for (const content of chunkText(JSON.stringify(metadata, null, 2))) {
            children.push({
                object: 'block',
                type: 'code',
                code: { language: 'json', rich_text: richText(content) }
            });
        }
    }

    if (/^https:\/\//i.test(screenshot)) {
        children.push({
            object: 'block',
            type: 'image',
            image: { type: 'external', external: { url: screenshot } }
        });
    } else if (screenshot) {
        children.push({
            object: 'block',
            type: 'paragraph',
            paragraph: { rich_text: richText('A screenshot was supplied as embedded browser data and was not uploaded to a third-party host.') }
        });
    }

    const page = await notionRequest('/pages', env, {
        method: 'POST',
        body: JSON.stringify({
            parent: { database_id: env.NOTION_DATABASE_ID },
            properties,
            children: children.slice(0, 100)
        })
    });

    return json({ success: true, id: page.id, url: page.url });
}

export default {
    async fetch(request, env) {
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
        if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

        try {
            return await submitBugReport(request, env);
        } catch (error) {
            console.error('[NotionBugProxy]', error);
            return json({ error: 'NOTION_REQUEST_FAILED', message: error.message || String(error) }, 502);
        }
    }
};
