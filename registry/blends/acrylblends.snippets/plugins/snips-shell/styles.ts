/** The Snippet Manager's look: a dark editor canvas, mint accents and the compact file list of the mockup. */
export const STYLES = `
*{box-sizing:border-box}html,body{margin:0;min-height:100%;}body{font:13px Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}button,input,select,textarea{font:inherit}button{cursor:pointer;border:0}svg{display:block}
.avatar{width:27px;height:27px;border-radius:50%;display:inline-grid;place-items:center;font-size:10px;font-weight:750;background:#e7edf4;color:#34465b;border:2px solid white}
.toast{position:fixed;left:50%;bottom:22px;transform:translate(-50%,16px);opacity:0;background:#17222e;color:white;padding:10px 15px;border-radius:8px;font-size:11px;transition:.2s;pointer-events:none;z-index:99}
.toast.show{opacity:1;transform:translate(-50%,0)}
:root{--ink:#20252b;--sub:#77818d;--stroke:#e4e7eb;--editor:#171c23}
body.ide{background:#f6f7f9;color:var(--ink)}
.i-top{height:54px;background:#111820;color:#dce4ec;display:flex;align-items:center;padding:0 18px;gap:24px}
.i-brand{font-weight:850;letter-spacing:.08em;font-size:12px;color:#dce4ec;text-decoration:none}
.i-brand span{color:#a9d5c5;font-size:16px;margin-right:8px}
.i-brand small{font:8px monospace;color:#73818d;margin-left:7px}
.i-crumb{font-size:10px;color:#8d9ba9}
.i-crumb span{padding:0 9px;color:#4e5d6b}
.i-crumb b{color:#e2e8ef;font-weight:600}
.i-topright{margin-left:auto;display:flex;align-items:center;gap:13px}
.i-topright>span{font:8px monospace;color:#6e8290}
.i-topright a.top-button{background:#a8dfc6;color:#16352a;border-radius:4px;padding:8px 12px;font-weight:750;font-size:9px;text-decoration:none}
.i-topright .avatar{border:0;background:#344251;color:#e6edf3}
.i-app{display:grid;grid-template-columns:205px 1fr;min-height:calc(100vh - 54px)}
.i-nav{background:#eef0f3;border-right:1px solid #dde2e6;padding:17px 12px;display:flex;flex-direction:column}
.i-nav-title{font:750 8px monospace;letter-spacing:.1em;color:#929ba5;margin:12px 8px 8px;display:flex;justify-content:space-between}
.i-nav-title button,.i-nav-title a{background:none;color:#65727f;text-decoration:none}
.i-nav a{padding:9px 8px;border-radius:5px;font-size:10px;color:#65717e;margin:1px 0;text-decoration:none;display:block}
.i-nav a.active{background:#ddebe5;color:#1f5e46;font-weight:750}
.i-nav a i{float:right;font-style:normal;font:9px monospace;color:#9aa4ad}
.i-nav .muted{color:#a5adb4;font-size:10px;padding:9px 8px;margin:1px 0;display:block;cursor:default}
.i-nav .muted i{float:right;font:8px monospace;color:#b3babf}
.lang{font:750 8px monospace;display:inline-grid;place-items:center;width:18px;height:18px;border-radius:4px;margin-right:7px}
.ts{background:#dce9fc;color:#3d6db6}.js{background:#f6efcf;color:#987d2d}.py{background:#e4e1f6;color:#7464b0}.sql{background:#f3e1d8;color:#a36745}.sh{background:#e1e7e9;color:#60717a}
.i-nav-bottom{margin-top:auto;border-top:1px solid #dbe0e5;padding:12px 7px;color:#8e99a4;font:9px monospace}
.i-main{padding:21px 23px;min-width:0}
.i-toolbar{display:flex;align-items:flex-end;justify-content:space-between;gap:14px}
.i-toolbar h1{font-size:20px;margin:0}
.i-toolbar p{font-size:9px;color:#89939d;margin:5px 0 0}
.i-tools{display:flex;gap:6px;align-items:center}
.i-tools input{width:230px;border:1px solid #dfe4e8;background:white;border-radius:5px;padding:8px;font-size:9px}
.i-tools select{border:1px solid #dfe4e8;background:white;border-radius:5px;padding:8px;font-size:9px;color:#68737d}
.i-tools button,.i-tools a{background:white;border:1px solid #dfe4e8;border-radius:5px;padding:8px 10px;font-size:9px;color:#68737d;text-decoration:none}
.i-content{display:grid;grid-template-columns:minmax(265px,330px) minmax(0,1fr);gap:13px;margin-top:17px;align-items:start}
.i-list,.i-editor{background:white;border:1px solid #e1e5e9;border-radius:7px;overflow:hidden}
.i-list-head{display:grid;grid-template-columns:1fr 48px 55px;padding:12px 11px;border-bottom:1px solid #eceff2;color:#99a2aa;font:750 7px monospace;letter-spacing:.07em}
.i-list article{padding:11px;border-bottom:1px solid #eef0f2;display:grid;grid-template-columns:1fr 42px 55px;align-items:center;gap:4px}
.i-list article.active{background:#edf5f1;border-left:2px solid #4e9b78;padding-left:9px}
.i-list article b{font-size:9px;grid-column:1}
.i-list article small{font-size:8px;color:#939ca5;grid-column:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:3px}
.i-list article>span{font:8px monospace;color:#6e7d88}
.i-list article time{font-size:8px;color:#98a1a9}
.i-list article a{color:inherit;text-decoration:none;display:contents}
.i-list article a:hover b{color:#1f5e46}
.i-more{display:block;width:100%;padding:11px;background:white;color:#7d8993;font-size:8px;text-align:center;text-decoration:none}
.i-file{display:flex;justify-content:space-between;background:#f8f9fa;border-bottom:1px solid #e6e9ec;padding:10px 14px;font-size:9px;color:#6b7781}
.i-file span:last-child{color:#8c969f}
.i-code{background:var(--editor);display:grid;grid-template-columns:37px 1fr;padding:18px 0;min-height:315px;overflow:auto}
.i-lines{font:10px/20px ui-monospace,monospace;text-align:right;color:#65727e;padding:0 10px;border-right:1px solid #2c333c}
.i-code pre{white-space:pre;font:10px/20px ui-monospace,SFMono-Regular,monospace;color:#ccd6de;margin:0;padding:0 17px}
.i-code em{color:#b2c9ff;font-style:normal}
.i-code strong{color:#a5e2c6;font-weight:500}
.i-code pre span{color:#e6bb77}
.i-code .tok-comment{color:#6d7b88}
.i-code .tok-string{color:#e6bb77}
.i-code .tok-number{color:#e6bb77}
.i-editor-foot{background:#111820;color:#7f8c98;display:flex;justify-content:space-between;padding:7px 12px;font:8px monospace}
.i-meta{padding:14px 16px;display:grid;grid-template-columns:1fr 1fr;gap:13px}
.i-meta b{font:750 7px monospace;color:#929da7;letter-spacing:.08em}
.i-meta p{font-size:9px;color:#64717d;line-height:1.5;margin:5px 0 0}
.i-meta code{background:#f0f2f4;padding:2px 4px;border-radius:3px;font:8px monospace}
.tags i{font-style:normal;background:#ecf3ef;color:#48765f;padding:4px 6px;border-radius:3px;margin-right:4px;font-size:8px;display:inline-block}
.tags button{background:none;color:#7d8993}
.i-actions{grid-column:1/-1;display:flex;justify-content:flex-end;gap:7px;border-top:1px solid #edf0f2;padding-top:12px;flex-wrap:wrap}
.i-actions button,.i-actions a{padding:8px 11px;border-radius:4px;background:#edf1f2;color:#52616a;font-size:8px;text-decoration:none;display:inline-block}
.i-actions button:last-child,.i-actions a:last-child{background:#214f3e;color:white}
.i-actions form{display:inline}
.i-vars{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}
.i-vars label{font:750 7px monospace;color:#8a949d;display:block;flex:1 1 120px}
.i-vars input{display:block;width:100%;margin-top:4px;border:1px solid #e1e5e9;border-radius:4px;padding:6px 7px;font:9px system-ui;background:white}
.notice{margin:13px 0 0;padding:9px 12px;border-radius:5px;font-size:10px}
.notice.ok{background:#e3f4ed;color:#257454}.notice.error{background:#fce9e6;color:#a9483a}.notice.warn{background:#fff2d9;color:#8f6424}
.i-empty{padding:28px 16px;color:#8a949d;font-size:10px;text-align:center}
.i-form{background:white;border:1px solid #e1e5e9;border-radius:7px;padding:18px;margin-top:17px;max-width:760px}
.i-form h2{font-size:14px;margin:0 0 4px}
.i-form p.hint{font-size:9px;color:#8a949d;margin:0 0 14px}
.i-form label{display:block;font:750 7px monospace;color:#8b96a0;letter-spacing:.06em;margin-top:12px}
.i-form input,.i-form select,.i-form textarea{display:block;width:100%;margin-top:5px;border:1px solid #dfe4e8;border-radius:5px;padding:9px;font:10px system-ui;color:#39434b;background:white}
.i-form textarea{min-height:260px;font:10px/1.6 ui-monospace,SFMono-Regular,monospace;white-space:pre;tab-size:2}
.i-form .row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.i-form .actions{display:flex;gap:7px;margin-top:16px;align-items:center}
.i-form .actions button,.i-form .actions a{padding:9px 13px;border-radius:4px;background:#edf1f2;color:#52616a;font-size:9px;text-decoration:none}
.i-form .actions button.primary{background:#214f3e;color:white}
.i-form .actions .danger{background:#fff0ec;color:#b45949;margin-left:auto}
.i-pages{display:flex;gap:5px;margin-top:13px;align-items:center;font-size:9px;color:#8a949d}
.i-pages a,.i-pages b{padding:5px 8px;border:1px solid #dfe4e8;border-radius:4px;background:white;text-decoration:none;color:#65717e}
.i-pages b{background:#214f3e;color:white;border-color:#214f3e}
.i-section{background:white;border:1px solid #e1e5e9;border-radius:7px;margin-top:13px;overflow:hidden}
.i-section>header{display:flex;justify-content:space-between;align-items:center;padding:13px 16px;border-bottom:1px solid #eef0f2}
.i-section>header b{font-size:10px}
.i-section>header small{font-size:8px;color:#9aa4ad}
.i-section table{width:100%;border-collapse:collapse}
.i-section th{text-align:left;font:750 7px monospace;color:#99a2aa;letter-spacing:.07em;padding:9px 16px;border-bottom:1px solid #eef0f2}
.i-section td{padding:10px 16px;border-bottom:1px solid #f0f2f3;font-size:9px;color:#63717a}
.i-section td b{color:#39434b}
.i-section td a{color:#1f5e46;text-decoration:none}
.i-collection-row{display:flex;justify-content:space-between;align-items:center;gap:10px}
.i-collection-row form{display:inline;margin:0}
.i-collection-row button{padding:7px 10px;border-radius:4px;background:#edf1f2;color:#52616a;font-size:8px}
@media(max-width:850px){.i-content{grid-template-columns:1fr}.i-list{display:none}.i-nav{display:none}.i-app{grid-template-columns:1fr}.i-form .row{grid-template-columns:1fr}}
`
