/** The Moodboard's look: the mockup's warm paper studio, its dotted canvas and object styles, plus the asset, settings and object pages. */
export const STYLES = `
*{box-sizing:border-box}
a{color:inherit;text-decoration:none}
button{font:inherit;cursor:pointer}
:focus-visible{outline:2px solid #263e35;outline-offset:2px}
body{margin:0;background:#e9e8e1;color:#262a27;font:13px Inter,system-ui,sans-serif}
.top{height:58px;background:#fbfaf6;border-bottom:1px solid #d8d8d0;display:flex;align-items:center;padding:0 22px;gap:22px}
.brand{font:700 14px Georgia,serif;letter-spacing:.03em}
.brand span{color:#b66f4c}
.crumb{font-size:10px;color:#899087}
.crumb b{color:#303730}
.top .grow{flex:1}
.top button,.top .share{border:1px solid #d6d8d0;background:#fff;padding:8px 10px;border-radius:4px;font-size:9px;color:inherit}
.top .share{background:#263e35;color:#fff;border-color:#263e35}
.top form{display:inline-flex;margin:0}
.work{display:grid;grid-template-columns:220px minmax(0,1fr);min-height:calc(100vh - 58px)}
.tools{background:#f5f4ef;border-right:1px solid #d8d9d2;padding:21px 15px}
.tools h4{font:9px ui-monospace;letter-spacing:.13em;color:#7f887e;margin:8px 5px 12px}
.tool{display:flex;gap:10px;align-items:center;padding:9px 10px;margin:3px 0;color:#4b564d;border-radius:5px;font-size:10px}
a.tool:hover{background:#ecebe4}
.tool.active{background:#e2e6dc;color:#1c4937}
.ico{width:24px;height:24px;display:grid;place-items:center;background:#fff;border:1px solid #e0e1d9;border-radius:4px;flex:none}
.colors{display:flex;gap:7px;padding:5px;flex-wrap:wrap}
.colors form{display:inline;margin:0}
.colors button{width:25px;height:25px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px #d2d2c8;cursor:pointer;padding:0}
.colors button.on{box-shadow:0 0 0 2px #263e35}
.aside-block{margin-top:20px}
.canvaswrap{padding:23px;overflow:hidden}
.boardhead{display:flex;align-items:end;justify-content:space-between;margin-bottom:15px;gap:15px}
.boardhead small{font:9px ui-monospace;letter-spacing:.14em;color:#889087}
.boardhead h1{font:500 26px Georgia,serif;margin:6px 0 2px}
.boardhead p{font-size:9px;color:#858d83;margin:0}
.boardhead button{border:1px solid #d6d8d0;background:#fff;padding:8px 10px;border-radius:4px;font-size:9px}
.board{position:relative;min-height:720px;background-color:#dcdcd3;background-image:radial-gradient(#bfc1b6 .7px,transparent .7px);background-size:15px 15px;border:1px solid #c7c8bd;box-shadow:0 8px 26px #30372714;overflow:hidden;aspect-ratio:1200/760}
.board:before{content:'CONCEPT / 03 - QUIET MODERN';position:absolute;right:19px;top:17px;font:8px ui-monospace;letter-spacing:.16em;color:#8e9488;pointer-events:none}
.item{position:absolute;cursor:move;box-shadow:0 7px 18px #34382c22;user-select:none;display:block}
.item:hover{box-shadow:0 10px 24px #34382c33}
.photo{width:215px;padding:7px;background:#f8f7f0}
.photo img{width:100%;height:145px;object-fit:cover;display:block}
.photo span{display:block;padding:8px 3px 3px;font:11px Georgia,serif}
.note{width:180px;background:#e7edcd;padding:14px 15px;font:12px Georgia,serif;line-height:1.5;white-space:pre-line}
.note small,.quote small{display:block;color:#828a65;font:8px ui-monospace;margin-bottom:7px}
.swatches{width:180px;background:#f9f7f0;padding:11px}
.swatches strong{font:10px Georgia,serif;display:block;margin-bottom:8px}
.swatches div{display:flex;gap:4px}
.swatches i{height:68px;flex:1}
.quote{width:210px;background:#293d37;color:#f0eee6;padding:17px;font:16px Georgia,serif;line-height:1.4;white-space:pre-line}
.quote small{color:#a7b8a9}
.caption{width:160px;font:italic 13px Georgia,serif;color:#61695c;border-bottom:1px solid #9ca397;padding:6px;white-space:pre-line}
.linkobject{width:190px;background:#f8f7f0;padding:12px;font:10px ui-monospace;color:#3f5748;border-bottom:2px solid #b9aa8b;word-break:break-all}
.reference{width:238px;padding:7px;background:#f8f7f0}
.reference img{width:100%;height:180px;object-fit:cover;display:block}
.reference span{display:block;padding:8px 3px 3px;font:11px Georgia,serif}
.detail{position:absolute;bottom:18px;left:18px;color:#737b70;font:8px ui-monospace}
.dragging{opacity:.8;z-index:20;box-shadow:0 15px 30px #0004}
.emptyboard{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#737b70;font-size:11px}
.emptyboard b{font:500 20px Georgia,serif;color:#4b564d}
.emptyboard a{padding:8px 11px;border:1px solid #b9bbae;background:#f8f7f0;border-radius:4px;font-size:9px}
.notice{margin:0 0 15px;padding:9px 12px;border-radius:5px;font-size:10px}
.notice.ok{background:#e2e6dc;color:#1c4937}
.notice.error{background:#f3ded7;color:#8a3b23}
.notice.warn{background:#f3ecd6;color:#786024}
.page{max-width:1000px;padding:26px 23px 40px}
.pagehead{display:flex;align-items:end;justify-content:space-between;gap:16px;margin-bottom:18px}
.pagehead small{font:9px ui-monospace;letter-spacing:.14em;color:#889087}
.pagehead h1{font:500 26px Georgia,serif;margin:6px 0 2px}
.pagehead p{font-size:9px;color:#858d83;margin:0}
.pagehead .button,.page .button{display:inline-block;padding:8px 11px;border:1px solid #263e35;background:#263e35;color:#fff;border-radius:4px;font-size:9px}
.pagehead .button{background:#fff;color:inherit;border-color:#d6d8d0}
.assetgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px}
.assetcard{background:#fbfaf6;border:1px solid #d8d8d0;border-radius:5px;padding:9px}
.assetcard img{width:100%;height:120px;object-fit:cover;display:block;border-radius:3px}
.assetcard .swatch{height:120px;border-radius:3px;display:block}
.assetcard b{display:block;font:500 15px Georgia,serif;margin:8px 0 4px}
.assetcard small{display:block;font:8px ui-monospace;color:#7f887e;margin-bottom:8px}
.assetcard form{margin:0}
.assetcard button{padding:6px 8px;border:1px solid #d6d8d0;background:#fff;border-radius:3px;font-size:8px}
.assetcard .tag{display:inline-block;padding:3px 6px;border:1px solid #d8d9d2;border-radius:10px;margin:0 4px 5px 0;font:8px ui-monospace;color:#7f887e}
.form{background:#fbfaf6;border:1px solid #d8d8d0;border-radius:6px;padding:16px;max-width:620px}
.formgrid{display:grid;grid-template-columns:1fr 1fr;gap:13px}
.field{display:block;margin-bottom:13px}
.field span{display:block;font:8px ui-monospace;letter-spacing:.12em;color:#7f887e;margin-bottom:5px}
.field input,.field select,.field textarea{width:100%;background:#fff;border:1px solid #d8d9d2;border-radius:4px;color:#262a27;padding:8px;font:10px system-ui}
.field textarea{min-height:80px;resize:vertical}
.field .hint{display:block;color:#909789;font-size:8px;margin-top:4px}
.actions{display:flex;gap:8px;align-items:center;margin-top:6px}
.actions .button{padding:8px 11px;border:1px solid #263e35;background:#263e35;color:#fff;border-radius:4px;font-size:9px}
.actions .cancel{color:#7f887e;font-size:9px}
.actions .danger{color:#8a3b23;border-color:#d9b9ad;background:#fbf3ef}
.layerlist{margin:0;padding:0;list-style:none}
.layerlist li{display:flex;align-items:center;gap:8px;padding:7px 5px;border-bottom:1px solid #ecebe4;font-size:10px;color:#4b564d}
.layerlist li:last-child{border-bottom:0}
.layerlist .z{margin-left:auto;font:8px ui-monospace;color:#8e9488}
.objectmeta{display:flex;gap:22px;margin:0 0 14px;color:#7f887e;font:9px ui-monospace}
.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#253c33;color:white;padding:10px 14px;border-radius:5px;opacity:0;transition:.2s;z-index:30;font-size:10px}
.toast.show{opacity:1}
@media(max-width:800px){.work{grid-template-columns:1fr}.tools{display:none}.canvaswrap{padding:12px}.board{min-height:780px}.top{padding:0 12px}.crumb{display:none}.assetgrid{grid-template-columns:1fr 1fr}.formgrid{grid-template-columns:1fr}}
@media(max-width:480px){.boardhead{display:block}.boardhead p{margin-top:5px}.assetgrid{grid-template-columns:1fr}}
`
