/** Small CRM's look, from the mockup: a cool white B2B surface, blue selection, company identity marks and compact deal cards. Light, with dark following the system. */
export const STYLES = `*{box-sizing:border-box}html,body{margin:0;min-height:100%}
:root{--txt:#1d2935;--muted:#6f7c89;--faint:#9aa5b0;--line:#e5e9ed;--blue:#2869d8;--blue-soft:#eaf1fc;--surface:#fff;--side:#f8f9fb;--page:#f4f6f8;--card:#fff;--green:#21966b;--red:#c2483d;--amber:#b7791f;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--txt:#e6ebf0;--muted:#94a1ae;--faint:#6f7c89;--line:#2a3541;--blue:#6ea0f5;--blue-soft:#1b2a40;--surface:#121a22;--side:#0f161d;--page:#0b1117;--card:#17212b;--green:#3bc596;--red:#ef7b70;--amber:#e3a94b;color-scheme:dark}}
body{font:13px/1.45 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--page);color:var(--txt)}
a{color:inherit;text-decoration:none}button,input,select,textarea{font:inherit;color:inherit}button{cursor:pointer}
.app{min-height:100vh;display:grid;grid-template-columns:200px minmax(0,1fr) 300px;max-width:1680px;margin:auto;background:var(--surface)}
.app.no-aside{grid-template-columns:200px minmax(0,1fr)}
.side{background:var(--side);border-right:1px solid var(--line);padding:21px 13px;display:flex;flex-direction:column;gap:2px}
.logo{font-weight:850;font-size:17px;margin:4px 8px 20px;display:block}.logo:first-letter{color:var(--blue)}
.work{border:1px solid var(--line);background:var(--surface);border-radius:6px;padding:9px 10px;font-size:11px;font-weight:700;margin-bottom:6px}
.side label{font:750 9px ui-monospace,monospace;letter-spacing:.12em;color:var(--faint);margin:20px 8px 6px;text-transform:uppercase}
.side nav{display:flex;flex-direction:column;gap:2px}
.side nav a{padding:9px 10px;border-radius:6px;color:var(--muted);font-size:12px;display:flex;gap:9px;align-items:center}
.side nav a:hover{background:var(--blue-soft)}.side nav a.on{background:var(--blue-soft);color:var(--blue);font-weight:750}
.side nav a em{margin-left:auto;font-style:normal;font-size:10px;background:var(--line);padding:1px 6px;border-radius:9px}
.user{margin-top:auto;border-top:1px solid var(--line);padding-top:13px;display:flex;align-items:center;gap:9px;font-size:11px}
.user>b{width:30px;height:30px;border-radius:50%;background:#e7d6c8;color:#5a4636;display:grid;place-items:center;font-size:11px}
.user small{display:block;color:var(--faint);margin-top:2px;font-size:10px}
.main{padding:24px 22px;min-width:0}
.head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}
.head small{font:750 9px ui-monospace,monospace;color:var(--faint);letter-spacing:.13em;text-transform:uppercase}
.head h1{font-size:23px;margin:6px 0 4px}.head p{font-size:12px;color:var(--muted);margin:0}
.head .actions{display:flex;gap:6px;flex-wrap:wrap}
.btn{display:inline-block;background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:8px 12px;font-size:12px;color:var(--muted)}
.btn:hover{border-color:var(--blue);color:var(--blue)}.btn.primary{background:var(--blue);border-color:var(--blue);color:#fff}.btn.primary:hover{filter:brightness(1.08);color:#fff}
.btn.danger{color:var(--red);border-color:var(--red);background:transparent}
.tabs{display:flex;align-items:center;gap:18px;border-bottom:1px solid var(--line);margin-top:20px;flex-wrap:wrap}
.tabs a{padding:0 0 10px;font-size:12px;color:var(--muted);border-bottom:2px solid transparent}
.tabs a.on{color:var(--blue);border-color:var(--blue);font-weight:750}.tabs a i{font-style:normal;background:var(--line);padding:1px 6px;border-radius:5px;margin-left:4px;font-size:10px}
.tabs form{margin-left:auto;display:flex;gap:5px;padding-bottom:7px}
input,select,textarea{border:1px solid var(--line);border-radius:6px;padding:7px 9px;background:var(--surface);font-size:12px;max-width:100%}
input:focus,select:focus,textarea:focus{outline:2px solid var(--blue-soft);border-color:var(--blue)}
.totals{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:14px 0;border-bottom:1px solid var(--line)}
.totals small,.kicker{font:750 9px ui-monospace,monospace;letter-spacing:.1em;color:var(--faint);text-transform:uppercase}
.totals b{display:block;font-size:19px;margin-top:5px}.totals .green,.green{color:var(--green)}
.board{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding-top:14px}
.stage{min-width:0;border-radius:8px;padding:4px;transition:outline .1s}.stage.over{outline:2px dashed var(--blue)}
.stage>header{display:flex;align-items:center;gap:6px;margin:2px 2px 10px}.stage>header b{font-size:12px}
.stage>header i{font:10px ui-monospace,monospace;background:var(--line);padding:2px 6px;border-radius:4px;font-style:normal;color:var(--muted)}
.stage>header strong{margin-left:auto;font:11px ui-monospace,monospace;color:var(--muted)}
.card{display:block;border:1px solid var(--line);border-radius:7px;padding:11px;margin-bottom:8px;background:var(--card);box-shadow:0 2px 4px #1f314008}
.card:hover{border-color:var(--blue)}.card.chosen{border-color:var(--blue);box-shadow:0 0 0 2px var(--blue-soft)}.card.dragging{opacity:.4}
.card>b{display:block;font-size:12px}.card>small{display:block;font-size:11px;color:var(--faint);margin-top:3px;min-height:16px}
.card>strong{font-size:13px;display:block;margin-top:8px}
.card footer{font-size:10px;color:var(--muted);margin-top:9px;border-top:1px solid var(--line);padding-top:7px;display:flex;gap:6px;align-items:center}
.card footer .pct{margin-left:auto}.card footer .late{color:var(--red);font-weight:700}.card footer .soon{color:var(--amber);font-weight:700}
.stage .add{display:block;width:100%;padding:8px;border:1px dashed var(--line);color:var(--faint);border-radius:6px;font-size:11px;text-align:center}
.stage .add:hover{border-color:var(--blue);color:var(--blue)}
.hint{text-align:center;color:var(--faint);font-size:11px;margin-top:18px}
.mark{width:26px;height:26px;border-radius:6px;display:inline-grid;place-items:center;font-size:11px;font-weight:800;margin-bottom:7px;flex:none}
.mark.lg{width:38px;height:38px;font-size:15px;margin:0}
.purple{background:#eee9f8;color:#7960ac}.orange{background:#faeee3;color:#b67a46}.teal{background:#e2f2ef;color:#438e83}.blue{background:#e8f0fc;color:#4a77b9}.red{background:#f8e9e7;color:#bb6e66}.gold{background:#f7f0df;color:#aa8c45}.green.mark,.mark.green{background:#e5f2e7;color:#4c9561}
@media (prefers-color-scheme:dark){.purple{background:#2a2540;color:#b9a6ea}.orange{background:#3d2b1c;color:#e8b583}.teal{background:#17332f;color:#7fcdbf}.blue{background:#1c2c45;color:#8db4ee}.red{background:#3d2420;color:#eb9a92}.gold{background:#3a3219;color:#dcc27a}.mark.green{background:#1b3322;color:#82cf98}}
.avatar{width:24px;height:24px;border-radius:50%;display:inline-grid;place-items:center;font-size:9px;font-weight:750;background:var(--blue-soft);color:var(--blue);flex:none}.avatar.none{background:var(--line);color:var(--faint)}
.inspector{border-left:1px solid var(--line);padding:21px 16px;background:var(--surface);min-width:0}
.inspector .kicker{display:block}
.dtitle{display:flex;gap:10px;align-items:center;margin:18px 0 14px}.dtitle b{display:block;font-size:13px}.dtitle small{display:block;color:var(--muted);font-size:11px;margin-top:2px}
.amount{padding:13px;background:var(--blue-soft);border-radius:7px}.amount b{display:block;font-size:23px;margin:5px 0}.amount span{font-size:11px;color:var(--muted)}
.fields{display:grid;grid-template-columns:1fr 1fr;gap:12px 8px;padding:15px 0;border-bottom:1px solid var(--line)}
.fields>div{min-width:0}.fields .kicker{display:block;margin-bottom:4px}.fields b{font-size:12px;font-weight:600;overflow-wrap:anywhere}
.fields form{display:flex;gap:4px}.fields select,.fields input{width:100%;padding:5px 6px;font-size:11px}
.next{padding:14px 0;border-bottom:1px solid var(--line)}.next b{display:block;font-size:12px;margin-top:7px}.next span{display:block;font-size:11px;color:var(--muted);margin-top:2px}
.next .late{color:var(--red);font-weight:700}.next button{width:100%;background:var(--blue);color:#fff;border:0;padding:9px;border-radius:6px;font-size:12px;margin-top:10px}
.activity{padding-top:14px}.activity p{font-size:12px;color:var(--muted);margin:9px 0}.activity p span{display:block;color:var(--faint);margin:2px 0 0 14px;font-size:10px}
.panel{border:1px solid var(--line);border-radius:8px;padding:14px;margin-top:16px;background:var(--card)}
.panel h2{font-size:14px;margin:0 0 10px}.panel form.row{display:flex;gap:6px;flex-wrap:wrap;align-items:flex-end}
.panel label{display:flex;flex-direction:column;gap:3px;font-size:11px;color:var(--muted)}
table{width:100%;border-collapse:collapse;margin-top:14px}th{text-align:left;font:750 9px ui-monospace,monospace;letter-spacing:.1em;color:var(--faint);text-transform:uppercase;padding:8px 10px;border-bottom:1px solid var(--line)}
td{padding:10px;border-bottom:1px solid var(--line);font-size:12px;vertical-align:middle}tr:hover td{background:var(--page)}
td .who{display:flex;gap:9px;align-items:center}td .who b{display:block}td .who small{color:var(--faint)}
.pill{display:inline-block;font-size:10px;font-weight:700;padding:2px 8px;border-radius:9px;background:var(--line);color:var(--muted)}
.pill.won{background:#e3f4ea;color:#1c7a52}.pill.lost{background:#f8e9e7;color:#b2443a}.pill.warn{background:#fbf0d9;color:#8a5f12}
.notice{margin:14px 0 0;padding:9px 12px;border-radius:6px;font-size:12px}.notice.ok{background:#e3f4ea;color:#1c7a52}.notice.error{background:#f8e9e7;color:#a63a30}.notice.warn{background:#fbf0d9;color:#8a5f12}
.empty{text-align:center;color:var(--muted);padding:30px 10px;border:1px dashed var(--line);border-radius:8px;margin-top:14px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:16px}.bar{height:8px;border-radius:4px;background:var(--line);overflow:hidden}.bar i{display:block;height:100%;background:var(--blue)}
.list{list-style:none;margin:0;padding:0}.list li{display:flex;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid var(--line)}.list li:last-child{border:0}
.crumbs{font-size:11px;color:var(--muted);margin-bottom:8px}.crumbs a{color:var(--blue)}
.confirm{border:1px solid var(--red);background:var(--card)}
@media(max-width:1150px){.app{grid-template-columns:170px minmax(0,1fr)}.inspector{display:none}.app.no-aside{grid-template-columns:170px minmax(0,1fr)}}
@media(max-width:750px){.app,.app.no-aside{grid-template-columns:1fr}.side{display:none}.main{padding:18px}.board{grid-template-columns:1fr 1fr}.totals{grid-template-columns:1fr 1fr}.two{grid-template-columns:1fr}}`
