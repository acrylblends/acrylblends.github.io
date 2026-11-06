/**
 * The workbench look, from design/mockup.html: a dark instrument panel with cyan for live values and amber for warnings. The mockup's rules are
 * kept as written; the additions below them make its tabs links, its buttons forms, and give it a light scheme for people whose system asks for one.
 */
export const LAB_STYLES = `
:root{--bg:#09121b;--panel:#101e2b;--side:#0d1924;--line:#294052;--ink:#e7f3fa;--muted:#8ba5b5;--cyan:#5ee2db;--cyan-ink:#062328;--amber:#f4b96d;--active:#102a35;--stat:#142638;--field:#0b1c27;--field-line:#294354;--notice-bg:#2a241a;--notice-ink:#dfc9a7;--dash:#456175;--danger:#ff8f86;color-scheme:dark}
@media (prefers-color-scheme:light){:root{--bg:#f3f7fa;--panel:#ffffff;--side:#e9f0f5;--line:#c9d7e1;--ink:#0f2230;--muted:#4f6878;--cyan:#0d8f88;--cyan-ink:#ffffff;--amber:#b4710f;--active:#dcf1f0;--stat:#eef4f8;--field:#0b1c27;--field-line:#294354;--notice-bg:#fbf1e1;--notice-ink:#6b4a12;--dash:#9fb3c1;--danger:#b3261e;color-scheme:light}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:13px/1.45 Inter,system-ui,sans-serif}
.top{height:64px;border-bottom:1px solid var(--line);display:flex;align-items:center;padding:0 22px;gap:18px}.brand{font-weight:900;font-size:18px;color:var(--ink);text-decoration:none}.brand i{font-style:normal;color:var(--cyan)}.crumb{color:var(--muted)}.spacer{flex:1}
.pill{border:1px solid var(--line);padding:6px 10px;border-radius:30px;color:var(--muted);font-size:11px;white-space:nowrap}.pill.changed{color:var(--amber);border-color:var(--amber)}.pill.done{color:var(--cyan);border-color:var(--cyan)}
button{cursor:pointer;font:inherit}.btn{border:0;background:var(--cyan);color:var(--cyan-ink);font-weight:800;padding:10px 15px;border-radius:7px;white-space:nowrap}
.shell{display:grid;grid-template-columns:225px minmax(360px,1fr) 250px;min-height:calc(100vh - 64px)}aside{padding:19px;background:var(--side)}.left{border-right:1px solid var(--line)}.right{border-left:1px solid var(--line)}
.eyebrow{font-size:9px;letter-spacing:.17em;color:var(--muted);margin:4px 0 14px;text-transform:uppercase}
.scenario{display:block;width:100%;text-align:left;color:var(--ink);background:transparent;padding:12px;border:1px solid var(--line);border-radius:8px;margin-bottom:8px;cursor:pointer}.scenario.active{border-color:var(--cyan);background:var(--active)}.scenario b{display:block}.scenario small,.log small{color:var(--muted);font-size:9px}
.new{margin-top:10px;width:100%;background:transparent;border:1px dashed var(--dash);color:var(--muted);padding:9px;border-radius:7px;display:block;text-align:center;text-decoration:none}
.main{padding:22px;min-width:0}.heading{display:flex;gap:15px;margin-bottom:18px;align-items:flex-start}.heading h1{font-size:22px;margin:0 0 3px}.heading p{margin:0;color:var(--muted)}
.tabs{display:flex;gap:5px;border-bottom:1px solid var(--line);margin-bottom:18px;overflow:auto}.tabs a{color:var(--muted);padding:10px 13px;border-bottom:2px solid transparent;white-space:nowrap;text-decoration:none}.tabs a.active{color:var(--cyan);border-color:var(--cyan)}
.workgrid{display:grid;grid-template-columns:250px 1fr;gap:13px}.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px}.card h3{margin:0 0 14px;font-size:12px}
.control{margin:16px 0}.control label{display:flex;justify-content:space-between;font-size:11px;margin-bottom:8px}.control output{color:var(--cyan)}input[type=range]{width:100%;accent-color:var(--cyan)}
.field{height:260px;border:1px solid var(--field-line);border-radius:9px;background:var(--field);overflow:hidden}.field svg{width:100%;height:100%;display:block}.legend{display:flex;justify-content:space-between;color:var(--muted);font-size:10px;margin-top:10px}
.statrow{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:13px}.stat{background:var(--stat);padding:11px;border-radius:7px}.stat small{display:block;color:var(--muted);font-size:10px}.stat b{font-size:19px}
.metric{display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid var(--line);font-size:10px;color:var(--muted);align-items:center}.metric b{color:var(--ink);text-align:right}
.log{padding:10px 0;border-bottom:1px solid var(--line);font-size:11px}.log small{display:block;margin-top:3px}.log a{color:var(--ink);text-decoration:none}.log a:hover b{color:var(--cyan)}
.notice{margin-top:15px;padding:11px;border-left:3px solid var(--amber);background:var(--notice-bg);color:var(--notice-ink);font-size:10px}
.trace{height:190px;width:100%}.trace svg{width:100%;height:100%;display:block}
a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid var(--cyan);outline-offset:2px}
.alert{margin:0 0 14px;padding:10px 12px;border-radius:7px;border:1px solid var(--line);font-size:12px}.alert.ok{border-color:var(--cyan);color:var(--cyan)}.alert.error{border-color:var(--danger);color:var(--danger)}
.input,select.input{width:100%;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:8px 9px;font:inherit}
.ghost{background:transparent;border:1px solid var(--line);color:var(--ink);padding:7px 11px;border-radius:7px;font-size:11px;text-decoration:none;display:inline-block}.ghost.danger{color:var(--danger)}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.inline{display:inline}.inline button{margin:0}
details.create summary{list-style:none}details.create summary::-webkit-details-marker{display:none}details.create form{margin-top:10px;display:grid;gap:8px}
.empty{padding:22px;text-align:center;color:var(--muted);border:1px dashed var(--dash);border-radius:9px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
@media(max-width:1000px){.shell{grid-template-columns:200px 1fr}.right{display:none}}
@media(max-width:680px){.shell{display:block}.left{display:none}.main{padding:14px}.workgrid{grid-template-columns:1fr}.crumb{display:none}.top{padding:0 12px;gap:10px}.top .pill{display:none}.btn{padding:9px 12px}.heading{flex-wrap:wrap}.statrow{grid-template-columns:1fr 1fr 1fr}}
`
