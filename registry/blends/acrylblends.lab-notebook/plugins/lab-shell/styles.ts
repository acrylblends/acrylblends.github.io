/** The Lab Notebook's look: the mockup's calm scientific blue-grey record, plus the data table, forms, attachments and history pages. */
export const STYLES = `
*{box-sizing:border-box}
a{color:inherit;text-decoration:none}
button{font:inherit;cursor:pointer}
:focus-visible{outline:2px solid #236d81;outline-offset:2px}
body{margin:0;background:#f3f5f6;color:#20313b;font:13px Inter,system-ui,sans-serif}
.shell{display:grid;grid-template-columns:250px 1fr;min-height:100vh}
.side{background:#e9eef0;border-right:1px solid #d5dfe2;padding:22px 17px}
.labbrand{display:block;font:650 13px Georgia,serif;letter-spacing:.02em;color:#20313b}
.labbrand i{font-style:normal;color:#2b7890}
.side h4{font:9px ui-monospace;letter-spacing:.14em;color:#7b9199;margin:32px 6px 11px}
.exp{display:block;padding:10px;border-radius:5px;margin:4px 0;font-size:10px;color:#5c7079;cursor:pointer}
.exp:hover{background:#e1eaec}
.exp.active{background:#d8e7eb;color:#1d5669}
.exp small{display:block;font-size:8px;color:#81939a;margin-top:4px}
.newbook{display:block;width:100%;border:1px dashed #aabdc3;background:transparent;color:#57717a;padding:9px;border-radius:5px;font-size:9px;margin-top:7px;text-align:center}
.newbook:hover{background:#e1eaec}
.sidefoot{margin-top:60px;color:#8a9aa0;font-size:8px;line-height:1.6}
.main{max-width:1250px;width:100%;padding:28px 38px;margin:0 auto}
.top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
.top small{font:9px ui-monospace;letter-spacing:.16em;color:#7b929a}
.top h1{font:500 26px Georgia,serif;margin:8px 0 3px}
.top p{font-size:10px;color:#7c8f97;margin:0}
.tools{display:flex;gap:7px;flex-wrap:wrap}
.tools button,.tools a{border:1px solid #d0dade;background:#fff;border-radius:5px;padding:8px 11px;font-size:9px;color:#47616b;display:inline-flex;align-items:center}
.tools .primary{background:#236d81;border-color:#236d81;color:#fff}
.cols{display:grid;grid-template-columns:minmax(0,1fr) 290px;gap:14px;margin-top:22px}
.paper{background:#fff;border:1px solid #dfe6e8;border-radius:6px;padding:25px 30px;box-shadow:0 5px 16px #243c4410}
.paperhead{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e9edef;padding-bottom:14px}
.paperhead small{font:9px ui-monospace;color:#8aa0a7}
.paperhead span{font-size:9px;color:#6f8288}
.paper h2{font:500 21px Georgia,serif;margin:21px 0 6px}
.meta{color:#91a0a5;font-size:9px}
.section{margin-top:23px}
.section h3{font:600 10px ui-monospace;letter-spacing:.1em;color:#5f7e88;margin:0 0 9px}
.section p{font-size:10px;line-height:1.65;color:#566b73;margin:0}
.measure{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}
.measure div{background:#f2f7f8;border:1px solid #e3ecee;border-radius:4px;padding:11px}
.measure small{display:block;color:#81959c;font-size:8px}
.measure b{font:600 20px Georgia,serif;display:block;margin:5px 0}
.measure em{font-style:normal;color:#5e9c89;font-size:8px}
.obs{border-left:2px solid #82b4c0;padding:2px 0 2px 12px;margin-top:13px}
.obs time{font:8px ui-monospace;color:#8da0a6}
.obs p{margin-top:5px}
.chartbox{background:#f5f9fa;border:1px solid #e2ebed;padding:13px;margin-top:10px}
.chartbox svg{width:100%;height:130px}
.aside{display:flex;flex-direction:column;gap:12px}
.card{background:#fff;border:1px solid #dfe6e8;border-radius:6px;padding:15px}
.card h3{margin:0 0 12px;font-size:11px}
.card label{display:block;font-size:8px;color:#80939a;margin:9px 0 5px}
.card input,.card select{width:100%;padding:8px;border:1px solid #dce5e7;border-radius:4px;font-size:9px;color:#314950;background:#fbfcfc}
.card button{margin-top:10px;background:#e3eff2;color:#286678;border:0;border-radius:4px;padding:8px 10px;font-size:9px;width:100%}
.result{background:#f1f6f7;padding:10px;border-radius:4px;color:#337184;font:11px ui-monospace;margin-top:10px}
.stamp{display:inline-block;background:#e7f3ef;color:#337e69;font:8px ui-monospace;padding:4px 7px;border-radius:3px}
.stamp.grey{background:#eef1f2;color:#6f8288}
.notice{margin:0 0 15px;padding:9px 12px;border-radius:5px;font-size:10px}
.notice.ok{background:#e7f3ef;color:#2c6d5a}
.notice.error{background:#f7e2de;color:#8c3a2a}
.notice.warn{background:#f6efd9;color:#786024}
.page{max-width:1100px}
.pagehead{display:flex;align-items:end;justify-content:space-between;gap:16px;margin-bottom:16px}
.pagehead small{font:9px ui-monospace;letter-spacing:.16em;color:#7b929a}
.pagehead h1{font:500 26px Georgia,serif;margin:8px 0 3px}
.pagehead p{font-size:10px;color:#7c8f97;margin:0}
.pagehead .button{display:inline-block;border:1px solid #d0dade;background:#fff;border-radius:5px;padding:8px 11px;font-size:9px;color:#47616b}
.notebookgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px;margin-top:18px}
.notebookcard{background:#fff;border:1px solid #dfe6e8;border-radius:6px;padding:16px}
.notebookcard b{display:block;font:500 19px Georgia,serif;margin-bottom:4px}
.notebookcard small{display:block;font:8px ui-monospace;color:#7b929a;margin-bottom:10px}
.notebookcard p{font-size:9px;color:#7c8f97;margin:0 0 10px}
.notebookcard a{font-size:9px;color:#236d81}
.notebookcard ul{list-style:none;margin:10px 0 0;padding:0}
.notebookcard li{font-size:9px;color:#566b73;border-top:1px solid #eef2f3;padding:6px 0}
.table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #dfe6e8;border-radius:6px;overflow:hidden}
.table th{text-align:left;font:8px ui-monospace;letter-spacing:.1em;color:#7b929a;padding:10px 12px;background:#f5f9fa;border-bottom:1px solid #e3ecee}
.table td{padding:9px 12px;border-bottom:1px solid #eef2f3;font-size:10px;color:#3f5963}
.table tr:last-child td{border-bottom:0}
.table td b{font-weight:600;color:#20313b}
.form{background:#fff;border:1px solid #dfe6e8;border-radius:6px;padding:16px;max-width:640px;margin-top:14px}
.formgrid{display:grid;grid-template-columns:1fr 1fr;gap:13px}
.field{display:block;margin-bottom:13px}
.field span{display:block;font:8px ui-monospace;letter-spacing:.12em;color:#7b929a;margin-bottom:5px}
.field input,.field select,.field textarea{width:100%;background:#fbfcfc;border:1px solid #dce5e7;border-radius:4px;color:#20313b;padding:8px;font:10px system-ui}
.field textarea{min-height:80px;resize:vertical}
.actions{display:flex;gap:8px;align-items:center;margin-top:6px}
.actions .button{padding:8px 11px;border:1px solid #236d81;background:#236d81;color:#fff;border-radius:4px;font-size:9px}
.actions .cancel{color:#7b929a;font-size:9px}
.empty{background:#fff;border:1px dashed #c9d7db;border-radius:6px;padding:30px;text-align:center;color:#7b929a;font-size:10px;margin-top:14px}
.empty b{display:block;font:500 18px Georgia,serif;color:#3f5963;margin-bottom:6px}
.attachment{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid #dfe6e8;border-radius:6px;padding:12px 14px;margin-top:9px}
.attachment .glyph{width:32px;height:32px;border-radius:4px;background:#e9f1f3;color:#236d81;display:grid;place-items:center;font:8px ui-monospace}
.attachment b{display:block;font-size:10px}
.attachment small{display:block;font:8px ui-monospace;color:#7b929a;margin-top:2px}
.attachment span.size{margin-left:auto;font:9px ui-monospace;color:#7b929a}
.history{list-style:none;margin:14px 0 0;padding:0}
.history li{display:flex;gap:14px;padding:10px 0;border-bottom:1px solid #e4ecee;font-size:10px;color:#566b73}
.history time{font:8px ui-monospace;color:#8da0a6;min-width:130px}
@media(max-width:900px){.shell{grid-template-columns:1fr}.side{display:none}.main{padding:20px}.cols{grid-template-columns:1fr}.notebookgrid{grid-template-columns:1fr}}
@media(max-width:520px){.top{display:block}.tools{margin-top:13px}.paper{padding:18px}.measure{grid-template-columns:1fr}.formgrid{grid-template-columns:1fr}}
`
