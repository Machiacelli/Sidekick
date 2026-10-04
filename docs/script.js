(() => {
"use strict";

const pages = [
  {id:"overview", title:"Overview", file:"README.md", icon:"Assets/Icons/General.png", group:"Getting started"},
  {id:"installation", title:"Installation", file:"Installation.md", icon:"Assets/Icons/General.png", group:"Getting started"},
  {id:"sidebar", title:"Sidebar Modules", file:"Sidebar%20Modules.md", icon:"Assets/Icons/Features.png", group:"Modules"},
  {id:"attack-war", title:"Attack & War", file:"Attack%20%26%20War.md", icon:"Assets/Icons/War.png", group:"Modules"},
  {id:"crimes", title:"Crimes", file:"Crimes.md", icon:"Assets/Icons/Crimes.png", group:"Modules"},
  {id:"gym-health-medical", title:"Gym, Health & Medical", file:"Gym%2C%20Health%20%26%20Medical.md", icon:"Assets/Icons/Features.png", group:"Modules"},
  {id:"items-inventory", title:"Items & Inventory", file:"Items%20%26%20Inventory.md", icon:"Assets/Icons/Trading.png", group:"Modules"},
  {id:"economy-market", title:"Economy & Market", file:"Economy%20%26%20Market.md", icon:"Assets/Icons/Trading.png", group:"Modules"},
  {id:"travel-utility-reminders", title:"Travel, Utility & Reminders", file:"Travel%2C%20Utility%20%26%20Reminders.md", icon:"Assets/Icons/General.png", group:"Modules"}
];

const moduleDescriptions = {
  "sidebar": "Timers, trackers, lists, reminders and other sidebar utilities.",
  "attack-war": "Attack helpers, chain tools, war monitoring and mugging utilities.",
  "crimes": "Crime assistants and helpers for Torn's different crime systems.",
  "gym-health-medical": "Gym automation, medical helpers, training controls and health utilities.",
  "items-inventory": "Inventory organization, loadouts, item tracking and weapon utilities.",
  "economy-market": "Market tools, pricing helpers, deposits, banking and economy utilities.",
  "travel-utility-reminders": "Travel controls, flight tracking, alerts, notifications and utility helpers."
};

const state={cache:new Map(),searchTimer:null};
const nav=document.getElementById("nav");
const content=document.getElementById("content");
const searchResults=document.getElementById("search-results");
const resultsList=document.getElementById("results-list");
const searchSummary=document.getElementById("search-summary");
const searchInput=document.getElementById("search-input");
const sidebar=document.getElementById("sidebar");
const themeToggle=document.getElementById("theme-toggle");
const mobileMenu=document.getElementById("mobile-menu");
const backToTop=document.getElementById("back-to-top");

function escapeHtml(value){
  return String(value)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

function slugify(text){
  return text.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g,"")
    .replace(/\s+/g,"-").replace(/-+/g,"-");
}

function closeMobileNav(){sidebar.classList.remove("open");}

function hideSearch(){
  content.hidden=false;
  searchResults.hidden=true;
}

function buildNav(){
  const groups=[...new Set(pages.map(p=>p.group))];

  nav.innerHTML=groups.map(group=>{
    const items=pages.filter(p=>p.group===group);

    return '<div class="nav-group">' +
      '<div class="nav-title">'+escapeHtml(group)+'</div>' +
      items.map(p =>
        '<a class="nav-link" data-page="'+p.id+'" href="#'+p.id+'">' +
          '<img class="nav-icon" src="'+p.icon+'" alt="" aria-hidden="true">' +
          '<span>'+escapeHtml(p.title)+'</span>' +
        '</a>'
      ).join("") +
    '</div>';
  }).join("");
}

async function loadPage(page){
  if(state.cache.has(page.id)) return state.cache.get(page.id);

  const response=await fetch(page.file,{cache:"no-cache"});
  if(!response.ok) throw new Error("Could not load "+page.file+" ("+response.status+")");

  const markdown=await response.text();
  state.cache.set(page.id,markdown);
  return markdown;
}

function rewriteLinks(root){
  root.querySelectorAll("a[href]").forEach(link=>{
    const href=link.getAttribute("href");
    if(!href) return;

    const match=pages.find(page=>{
      const decoded=decodeURIComponent(page.file);
      return href===decoded || href===page.file || href.endsWith("/"+decoded);
    });

    if(match){
      link.setAttribute("href","#"+match.id);
      link.addEventListener("click",closeMobileNav,{once:true});
    }else if(/^https?:\/\//i.test(href)){
      link.target="_blank";
      link.rel="noopener";
    }
  });
}

function addHeadingIds(){
  content.querySelectorAll("h2,h3").forEach(heading=>{
    if(!heading.id) heading.id=slugify(heading.textContent);
  });
}

function buildHero(){
  const cards=pages.filter(page=>page.id!=="overview" && page.id!=="installation").map(page=>{
    const description=moduleDescriptions[page.id]||"Documentation for this Sidekick module group.";

    return '<a class="module-card" href="#'+page.id+'">' +
      '<img class="module-card-icon" src="'+page.icon+'" alt="" aria-hidden="true">' +
      '<div class="module-card-title">'+escapeHtml(page.title)+'</div>' +
      '<div class="module-card-description">'+escapeHtml(description)+'</div>' +
    '</a>';
  }).join("");

  return '<section class="hero">' +
    '<img class="hero-logo" src="Assets/logo.png" alt="Sidekick">' +
    '<h1>The Swiss Army Knife for Torn</h1>' +
    '<p>Explore every Sidekick module, find where features live, and learn how to configure the tools you use most.</p>' +
  '</section>' +
  '<div class="module-grid">'+cards+'</div>';
}

async function renderPage(page){
  hideSearch();

  document.querySelectorAll(".nav-link").forEach(link=>{
    link.classList.toggle("active",link.dataset.page===page.id);
  });

  content.innerHTML='<div class="loading"><span class="spinner"></span>Loading documentation…</div>';

  try{
    const markdown=await loadPage(page);

    if(!window.marked) throw new Error("Markdown renderer failed to load.");

    content.innerHTML=marked.parse(markdown);

    rewriteLinks(content);
    addHeadingIds();

    if(page.id==="overview"){
      const firstHeading=content.querySelector("h1");
      if(firstHeading) firstHeading.remove();

      const hero=document.createElement("div");
      hero.innerHTML=buildHero();
      content.prepend(hero);
    }

    window.scrollTo({top:0,behavior:"instant"});
  }catch(error){
    content.innerHTML=
      '<div class="content-header">' +
        '<div class="eyebrow">Documentation error</div>' +
        '<h1>Unable to load this page</h1>' +
        '<p class="lede">'+escapeHtml(error.message)+'</p>' +
      '</div>' +
      '<p>Check that the Markdown source file is present in the docs folder.</p>';
  }
}

function highlight(value,query){
  const escaped=query.replace(/[\\^$.*+?()[\]{}|]/g,"\\$&");
  return value.replace(new RegExp("("+escaped+")","ig"),"<mark>$1</mark>");
}

async function runSearch(query){
  const normalized=query.trim().toLowerCase();

  if(!normalized){
    hideSearch();
    return;
  }

  document.querySelectorAll(".nav-link").forEach(link=>link.classList.remove("active"));

  content.hidden=true;
  searchResults.hidden=false;
  resultsList.innerHTML='<div class="loading"><span class="spinner"></span>Searching…</div>';

  const results=[];

  for(const page of pages){
    try{
      const markdown=await loadPage(page);
      const plain=markdown
        .replace(/!\[[^\]]*\]\([^)]*\)/g," ")
        .replace(/\[([^\]]+)\]\([^)]*\)/g,"$1")
        .replace(/[#*_>|-]/g," ")
        .replace(/\s+/g," ").trim();

      const index=plain.toLowerCase().indexOf(normalized);

      if(index!==-1){
        const start=Math.max(0,index-90);
        const end=Math.min(plain.length,index+normalized.length+150);

        results.push({
          page,
          snippet:(start>0?"… ":"")+plain.slice(start,end)+(end<plain.length?" …":"")
        });
      }
    }catch(_){}
  }

  searchSummary.textContent=results.length
    ? results.length+" page"+(results.length===1?"":"s")+' matched "'+query.trim()+'".'
    : 'No documentation pages matched "'+query.trim()+'".';

  if(!results.length){
    resultsList.innerHTML='<div class="empty-state">Try a different term, feature name, or setting.</div>';
    return;
  }

  resultsList.innerHTML=results.map(result =>
    '<a class="search-result" href="#'+result.page.id+'">' +
      '<div class="search-result-category">'+escapeHtml(result.page.group)+'</div>' +
      '<div class="search-result-title">'+escapeHtml(result.page.title)+'</div>' +
      '<div class="search-result-snippet">'+highlight(escapeHtml(result.snippet),query.trim())+'</div>' +
    '</a>'
  ).join("");

  resultsList.querySelectorAll(".search-result").forEach(link=>{
    link.addEventListener("click",()=>{
      searchInput.value="";
      closeMobileNav();
    });
  });
}

function navigate(){
  const id=location.hash.replace(/^#/ ,"")||"overview";
  const page=pages.find(item=>item.id===id)||pages[0];

  renderPage(page);
  closeMobileNav();
}

function setupTheme(){
  const saved=localStorage.getItem("sidekick-docs-theme");
  const prefersDark=window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme=saved||(prefersDark?"dark":"light");

  document.documentElement.dataset.theme=theme;
  themeToggle.textContent=theme==="dark"?"☀":"☾";
}

themeToggle.addEventListener("click",()=>{
  const next=document.documentElement.dataset.theme==="dark"?"light":"dark";

  document.documentElement.dataset.theme=next;
  localStorage.setItem("sidekick-docs-theme",next);
  themeToggle.textContent=next==="dark"?"☀":"☾";
});

mobileMenu.addEventListener("click",()=>sidebar.classList.toggle("open"));

searchInput.addEventListener("input",()=>{
  clearTimeout(state.searchTimer);
  state.searchTimer=setTimeout(()=>runSearch(searchInput.value),180);
});

document.addEventListener("keydown",event=>{
  if(event.key==="/"&&document.activeElement!==searchInput&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
    event.preventDefault();
    searchInput.focus();
  }

  if(event.key==="Escape"){
    if(document.activeElement===searchInput){
      searchInput.value="";
      searchInput.blur();
      hideSearch();
      navigate();
    }

    closeMobileNav();
  }
});

window.addEventListener("scroll",()=>{
  backToTop.classList.toggle("visible",window.scrollY>500);
},{passive:true});

backToTop.addEventListener("click",()=>window.scrollTo({top:0,behavior:"smooth"}));
window.addEventListener("hashchange",navigate);

buildNav();
setupTheme();
navigate();
})();
