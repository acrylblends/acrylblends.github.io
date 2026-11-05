/**
 * The hub's look, from design/mockup.html: warm paper, serif (Georgia) headings, a sage focus card, pastel note cards and a quiet agenda rail.
 * Colours are tokens on :root, redefined for a dark system theme, so every page plugin that uses these classes is readable in both.
 * The mockup's type is set very small (8-10px); here it is about a quarter larger, the same proportions, so it reads at arm's length.
 */
export const HUB_STYLES = `
:root{color-scheme:light;--paper:#fbfaf7;--page:#f7f6f2;--side:#f2f0e9;--side-line:#e9e6dd;--ink:#292b2b;--ink-2:#414540;--muted:#8c8d84;--faint:#a5a59a;--line:#e9e7e0;--line-2:#efede8;--card:#fff;--card-line:#e4e0d5;--accent:#53694f;--accent-ink:#fff;--accent-soft:#e7e9df;--accent-text:#43553f;--sage:#e9ede4;--sage-line:#e0e6d9;--sage-text:#71826a;--sage-bar:#d6ddce;--sage-fill:#78906e;--yellow:#f6f0de;--blue:#e8eef0;--green:#e9ede4;--rose:#f5e6e4;--violet:#ece8f4;--bar-meeting:#9e8ec4;--bar-focus:#83afa0;--bar-personal:#d6a07b;--warn:#a5622f;--warn-soft:#f8ebdc;--danger:#b4442f;--chip:#f4f2eb;--dot-sage:#7a9672;--dot-amber:#d6a07b;--dot-sky:#7fa3b8;--dot-violet:#9e8ec4;--dot-rose:#c98a8a}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){color-scheme:dark;--paper:#1c1d1a;--page:#151613;--side:#191a17;--side-line:#2a2b27;--ink:#e9e7e0;--ink-2:#d2d0c8;--muted:#9a9b91;--faint:#7c7d74;--line:#2d2e2a;--line-2:#262723;--card:#222320;--card-line:#33342f;--accent:#8ba586;--accent-ink:#141512;--accent-soft:#2a3127;--accent-text:#b9cdb2;--sage:#252b22;--sage-line:#323a2e;--sage-text:#a7b99f;--sage-bar:#3a4535;--sage-fill:#8ba586;--yellow:#2e2a1f;--blue:#1f272a;--green:#232a20;--rose:#2e2221;--violet:#26232e;--warn:#e0a46e;--warn-soft:#33281d;--danger:#e58b77;--chip:#2a2b27}}
*{box-sizing:border-box}html,body{margin:0;min-height:100%}
body{background:var(--page);color:var(--ink);font:14px/1.45 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
button,input,select,textarea{font:inherit;color:inherit}button{cursor:pointer;border:0;background:none}a{color:inherit;text-decoration:none}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.serif,h1,h2,h3{font-family:Georgia,"Iowan Old Style","Times New Roman",serif;font-weight:500}
.p-app{max-width:1500px;margin:auto;min-height:100vh;display:grid;grid-template-columns:250px minmax(0,1fr);background:var(--paper)}
.p-side{background:var(--side);border-right:1px solid var(--side-line);padding:28px 18px;display:flex;flex-direction:column;position:sticky;top:0;height:100vh;overflow:auto}
.p-logo{font:700 24px Georgia,serif;margin:0 8px 30px;display:flex;gap:8px;align-items:center}.p-logo i{font-style:normal;color:var(--dot-sage)}
.p-capture{display:flex;align-items:center;gap:6px;background:var(--card);border:1px solid var(--card-line);border-radius:8px;padding:4px 6px 4px 10px}
.p-capture input{flex:1;min-width:0;border:0;background:transparent;padding:7px 0;font-size:13px;font-weight:600;color:var(--ink-2)}.p-capture input::placeholder{color:var(--ink-2)}
.p-capture kbd{background:var(--chip);padding:2px 6px;border-radius:4px;color:var(--faint);font:10px ui-monospace,monospace}
.p-label{display:block;font:750 10px ui-monospace,"SF Mono",Menlo,monospace;letter-spacing:.14em;color:var(--faint);margin:30px 10px 10px;text-transform:uppercase}
.p-nav a{display:flex;align-items:center;gap:10px;padding:10px 11px;color:var(--muted);font-size:13px;border-radius:7px}
.p-nav a:hover{background:var(--accent-soft)}.p-nav a.on{background:var(--accent-soft);color:var(--accent-text);font-weight:700}
.p-nav a span:first-child{width:16px;text-align:center}.p-nav a em{margin-left:auto;font-style:normal;background:var(--card);padding:2px 7px;border-radius:9px;font-size:11px}
.p-dot{width:8px;height:8px;border-radius:50%;display:inline-block;background:var(--dot-sage)}
.p-dot.sage{background:var(--dot-sage)}.p-dot.amber{background:var(--dot-amber)}.p-dot.sky{background:var(--dot-sky)}.p-dot.violet{background:var(--dot-violet)}.p-dot.rose{background:var(--dot-rose)}
.p-user{margin-top:auto;border-top:1px solid var(--side-line);padding-top:18px;display:flex;align-items:center;gap:10px;font-size:13px}
.p-user>b{width:34px;height:34px;border-radius:50%;background:var(--accent-soft);color:var(--accent-text);display:grid;place-items:center;font-size:11px}
.p-user small{display:block;color:var(--muted);font-size:11px;margin-top:3px}
.p-main{padding:40px 44px;max-width:1240px;margin:0 auto;width:100%}
.p-head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;border-bottom:1px solid var(--line);padding-bottom:26px}
.p-eyebrow{font-size:11px;letter-spacing:.13em;color:var(--muted);font-weight:700;text-transform:uppercase}
.p-head h1{font-size:36px;letter-spacing:-.5px;margin:12px 0 6px;line-height:1.15}.p-head h1 span{color:var(--sage-fill)}
.p-head p{font-size:13px;color:var(--muted);margin:0}
.p-btn{display:inline-flex;align-items:center;gap:6px;background:var(--accent);color:var(--accent-ink);border-radius:7px;padding:11px 16px;font-size:12px;font-weight:600;white-space:nowrap}
.p-btn:hover{filter:brightness(1.06)}.p-btn.ghost{background:transparent;color:var(--accent-text);border:1px solid var(--card-line)}.p-btn.danger{background:transparent;color:var(--danger);border:1px solid var(--card-line)}
.p-link{color:var(--muted);font-size:12px}.p-link:hover{color:var(--ink)}
.p-grid{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:40px;padding-top:28px}
.p-section{display:flex;align-items:baseline;gap:12px}.p-section h2{font-size:24px;margin:0}.p-section small{font-size:12px;color:var(--muted)}
.p-section.split{justify-content:space-between}
.p-focus{background:var(--sage);border:1px solid var(--sage-line);border-radius:10px;padding:19px 21px;margin:18px 0 24px}
.p-focus .p-label{margin:0;color:var(--sage-text);letter-spacing:.12em}
.p-focus h3{font-size:21px;margin:10px 0 6px}.p-focus p{font-size:12px;color:var(--sage-text);margin:0}
.p-focus .row{display:flex;align-items:center;gap:10px;margin-top:16px}.p-focus small{font-size:11px;color:var(--sage-text)}
.p-focus .row a,.p-focus .row button{margin-left:auto;color:var(--accent-text);font-size:12px}
.p-progress{width:140px;height:5px;background:var(--sage-bar);border-radius:4px;overflow:hidden}.p-progress i{display:block;height:100%;background:var(--sage-fill)}
.p-listhead{display:flex;justify-content:space-between;align-items:baseline;padding-bottom:9px;border-bottom:1px solid var(--line)}
.p-listhead b{font:500 17px Georgia,serif}.p-listhead small{font-size:11px;color:var(--faint)}
.p-task{display:flex;align-items:center;gap:13px;padding:13px 2px;border-bottom:1px solid var(--line-2)}
.p-check{flex:none;border:1px solid var(--card-line)!important;border-radius:50%;width:21px;height:21px;display:grid;place-items:center;color:var(--sage-fill);font-size:11px;background:transparent}
.p-check:hover{background:var(--sage)}.p-task.done .p-check{background:var(--sage-fill);color:var(--accent-ink)}
.p-task .what{min-width:0;flex:1}.p-task b{display:block;font-size:13px;font-weight:600}.p-task.done b{text-decoration:line-through;color:var(--muted);font-weight:500}
.p-task small{display:block;color:var(--muted);font-size:11px;margin-top:4px}
.p-when{margin-left:auto;font-style:normal;color:var(--muted);font-size:11px;letter-spacing:.04em;white-space:nowrap}
.p-when.overdue{color:var(--warn);background:var(--warn-soft);padding:3px 7px;border-radius:5px;font-weight:600}
.p-done{font-size:11px;color:var(--sage-text);padding:13px 0}
.p-notegrid{display:grid;grid-template-columns:1fr 1fr;gap:11px;margin-top:12px}
.p-note{display:block;border-radius:8px;padding:15px;min-height:150px;background:var(--yellow);border:1px solid transparent}.p-note:hover{border-color:var(--card-line)}
.p-note.sage{background:var(--green)}.p-note.amber{background:var(--yellow)}.p-note.sky{background:var(--blue)}.p-note.violet{background:var(--violet)}.p-note.rose{background:var(--rose)}
.p-note small{font-size:10px;letter-spacing:.08em;color:var(--muted);text-transform:uppercase}.p-note h3{font-size:17px;margin:11px 0 6px}
.p-note p{font-size:12px;line-height:1.6;color:var(--muted);margin:0;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.p-rail{border-left:1px solid var(--line);padding-left:24px}
.p-week{display:flex;align-items:flex-end;gap:6px}.p-week>div{margin-right:auto}.p-week h2{font-size:22px;margin:0}.p-week small{font-size:12px;color:var(--muted)}
.p-week a{border:1px solid var(--line);border-radius:5px;width:28px;height:28px;display:grid;place-items:center;color:var(--muted)}
.p-days{display:grid;grid-template-columns:repeat(5,1fr);margin-top:18px}
.p-days a{text-align:center;font:10px ui-monospace,monospace;color:var(--muted);text-transform:uppercase}
.p-days b{display:grid;place-items:center;width:31px;height:31px;margin:7px auto 0;border-radius:50%;font:13px system-ui,sans-serif}
.p-days .today{color:var(--accent-text)}.p-days .today b{background:var(--sage-fill);color:var(--accent-ink)}
.p-rail hr{border:0;border-top:1px solid var(--line);margin:20px 0}
.p-rail .p-label{margin:0;color:var(--ink-2);display:flex;justify-content:space-between}.p-rail .p-label small{font-weight:400;color:var(--faint)}
.p-event{display:grid;grid-template-columns:44px 3px 1fr;gap:10px;margin:15px 0;align-items:start}
.p-event time{font:11px ui-monospace,monospace;color:var(--muted)}.p-event i{height:38px;width:3px;background:var(--bar-meeting);border-radius:3px}
.p-event i.focus{background:var(--bar-focus)}.p-event i.personal{background:var(--bar-personal)}.p-event b{display:block;font-size:12px;font-weight:600}
.p-event small{display:block;color:var(--muted);font-size:11px;margin-top:4px}.p-event .clash{color:var(--warn);font-weight:600}
.p-add{display:block;width:100%;text-align:left;border:1px dashed var(--card-line);padding:10px;border-radius:6px;margin-top:10px;color:var(--muted);font-size:12px}
.p-quote{font:italic 14px/1.7 Georgia,serif;color:var(--faint);margin:30px 0 0;border-top:1px solid var(--line);padding-top:16px}
.p-card{background:var(--card);border:1px solid var(--card-line);border-radius:10px;padding:18px 20px}
.p-form{display:grid;gap:12px}.p-form .row{display:flex;flex-wrap:wrap;gap:10px;align-items:end}
.p-field{display:grid;gap:5px;font-size:11px;color:var(--muted);flex:1 1 150px}
.p-field input,.p-field select,.p-field textarea,.p-input{width:100%;padding:9px 11px;border:1px solid var(--card-line);border-radius:7px;background:var(--paper);font-size:13px}
.p-field textarea{min-height:280px;resize:vertical;line-height:1.6;font-family:Georgia,serif;font-size:15px}
.p-empty{padding:34px 10px;text-align:center;color:var(--muted);font-size:13px}.p-empty b{display:block;font:500 19px Georgia,serif;color:var(--ink-2);margin-bottom:6px}
.p-alert{border-radius:8px;padding:11px 14px;font-size:13px;margin:16px 0 0}.p-alert.ok{background:var(--sage);color:var(--accent-text)}
.p-alert.error{background:var(--warn-soft);color:var(--danger)}.p-alert.warn{background:var(--warn-soft);color:var(--warn)}
.p-tag{display:inline-block;background:var(--chip);color:var(--muted);border-radius:10px;padding:2px 8px;font-size:11px;margin-right:4px}
.p-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:22px 0 6px}
.p-chip{border:1px solid var(--line);border-radius:14px;padding:5px 12px;font-size:12px;color:var(--muted)}.p-chip.on{background:var(--accent-soft);color:var(--accent-text);border-color:transparent;font-weight:600}
@media(max-width:1000px){.p-app{grid-template-columns:200px minmax(0,1fr)}.p-grid{grid-template-columns:1fr}.p-rail{border:0;padding:0}.p-main{padding:24px}}
@media(max-width:680px){.p-app{grid-template-columns:1fr}.p-side{position:static;height:auto;padding:16px}.p-side .p-label,.p-side .p-user,.p-side .p-spaces{display:none}.p-nav{display:flex;flex-wrap:wrap;gap:2px;margin-top:10px}.p-logo{margin-bottom:14px}.p-notegrid{grid-template-columns:1fr}.p-head{flex-direction:column}.p-main{padding:20px 16px}}
`
