/** The Photo Gallery's look: the mockup's charcoal editorial archive, plus the few screens the mockup implies (album index, lightbox route, upload). */
export const STYLES = `
*{box-sizing:border-box}
a{color:inherit;text-decoration:none}
button{font:inherit;cursor:pointer}
:focus-visible{outline:2px solid #c5ad85;outline-offset:2px}
body{margin:0;background:#111;color:#f4f2ed;font:13px Inter,system-ui,sans-serif}
.bar{height:64px;display:flex;align-items:center;padding:0 36px;border-bottom:1px solid #282725;gap:35px}
.wordmark{font:600 16px Georgia,serif;letter-spacing:.02em;color:inherit}
.wordmark span{color:#c5ad85}
.bar nav{display:flex;gap:23px;color:#87857f;font-size:10px}
.bar nav a{color:inherit}
.bar nav a.on{color:#e8e4dc;font-weight:600}
.bar .right{margin-left:auto;color:#99968e;font-size:10px}
.layout{display:grid;grid-template-columns:220px minmax(0,1fr);max-width:1500px;margin:auto;min-height:calc(100vh - 64px)}
aside{border-right:1px solid #292825;padding:30px 22px}
.aside-label{font:9px ui-monospace;letter-spacing:.15em;color:#77756e;margin-bottom:13px}
.aside-block{margin-top:35px}
.album{display:flex;align-items:center;gap:10px;padding:8px;border-radius:5px;color:#aaa79e;font-size:10px;cursor:pointer}
.album.active{background:#292824;color:#fff}
.album-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.thumb{width:28px;height:28px;border-radius:4px;background-size:cover;background-position:center;flex:none;overflow:hidden}
.thumb img{width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit}
.thumb.glyph{display:flex;align-items:center;justify-content:center;background:#8b745b;color:#f4f2ed;font-size:12px}
.count{margin-left:auto;color:#706e67;font:9px ui-monospace}
.storage{height:4px;background:#34322c;border-radius:4px}
.storage i{display:block;height:4px;background:#c2a77c;border-radius:4px}
.storage-text{font-size:9px;color:#817e75;margin:8px 0 0}
.main{padding:30px 38px}
.head{display:flex;align-items:end;justify-content:space-between;gap:18px}
.head small{font:9px ui-monospace;letter-spacing:.15em;color:#8b887f}
.head h1{font:500 34px Georgia,serif;margin:9px 0 5px}
.head p{color:#8c8980;margin:0;font-size:10px;max-width:520px}
.head .button,.head button{padding:9px 12px;border:1px solid #4b473e;background:#25231f;color:#eee7dc;border-radius:4px;font-size:9px;white-space:nowrap}
.tabs{display:flex;gap:18px;border-bottom:1px solid #34322d;margin-top:25px;align-items:flex-end}
.tabs a{background:none;border:0;color:#77756e;padding:0 0 11px;font-size:9px;border-bottom:1px solid transparent}
.tabs a.active{color:#efe8dc;border-bottom:1px solid #c5ad85}
.tabs .searchform{margin-left:auto;padding-bottom:5px}
.searchform input{width:200px;height:21px;background:#191815;border:1px solid #34322d;border-radius:4px;color:#e9e5dc;padding:2px 8px;font:9px system-ui}
.searchform input::placeholder{color:#77756e}
.photos{columns:4;column-gap:12px;margin-top:17px}
.photo{position:relative;break-inside:avoid;margin:0 0 12px;overflow:hidden;background:#282722;cursor:pointer;display:block;color:#fff}
.photo img{width:100%;height:auto;display:block;filter:saturate(.82);transition:transform .35s,filter .35s}
.photo:hover img{transform:scale(1.025);filter:saturate(1.1)}
.photo .cap{position:absolute;bottom:0;left:0;right:0;padding:25px 10px 9px;background:linear-gradient(transparent,#0009);font:10px Georgia,serif;opacity:0;transition:.2s}
.photo:hover .cap{opacity:1}
.pager{display:flex;justify-content:space-between;align-items:center;gap:18px;margin-top:22px;padding:12px 2px 0;border-top:1px solid #292825;color:#8b887f;font:9px ui-monospace}
.pager-links{display:flex;gap:16px;align-items:center}
.pager a{color:#d6d1c5}
.pager a:hover{color:#fff}
.empty{margin:44px auto;max-width:430px;text-align:center;color:#8c8980;font-size:11px;border:1px dashed #34322d;border-radius:8px;padding:36px 24px}
.empty b{display:block;color:#e8e4dc;font:500 19px Georgia,serif;margin-bottom:8px}
.empty p{margin:0 0 16px;line-height:1.55}
.empty .button{display:inline-block;padding:8px 11px;border:1px solid #4b473e;background:#25231f;color:#eee7dc;border-radius:4px;font-size:9px}
.notice{margin:0 0 16px;padding:9px 12px;border-radius:5px;font-size:10px}
.notice.ok{background:#232a20;color:#bfe0a8}
.notice.error{background:#331d1b;color:#f0b0a5}
.notice.warn{background:#332b1c;color:#e9c77d}
.albumgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:22px}
.albumcard{display:grid;grid-template-columns:124px minmax(0,1fr);gap:14px;background:#181714;border:1px solid #2b2924;border-radius:7px;padding:10px;color:inherit}
.albumcard:hover{border-color:#4b473e}
.albumcard img{width:124px;height:96px;object-fit:cover;display:block;border-radius:4px;filter:saturate(.85)}
.albumcard b{display:block;font:500 19px Georgia,serif;color:#eee8dc;margin:4px 0 5px}
.albumcard small{display:block;font:8px ui-monospace;letter-spacing:.1em;color:#77756e;margin-bottom:7px}
.albumcard p{margin:0;color:#8c8980;font-size:9px;line-height:1.5}
.albummeta{display:flex;gap:30px;margin-top:20px;padding:14px 16px;background:#171614;border:1px solid #2b2924;border-radius:6px}
.albummeta small{display:block;font:8px ui-monospace;letter-spacing:.12em;color:#77756e;margin-bottom:5px}
.albummeta b{font:500 15px Georgia,serif;color:#e8e4dc}
.lbpage{height:100vh;display:flex;flex-direction:column;background:#080808}
.lbstage{position:relative;flex:1;min-height:0;background:#080808;display:flex;align-items:center;justify-content:center;padding:40px 90px}
.lbstage img{max-width:min(83vw,1200px);max-height:64vh;object-fit:contain;display:block}
.lbclose,.lbprev,.lbnext{position:absolute;background:#292722;color:#fff;border:1px solid #514d43;border-radius:50%;width:40px;height:40px;font-size:18px;display:flex;align-items:center;justify-content:center}
.lbclose{right:24px;top:24px}
.lbprev{left:28px;top:50%;transform:translateY(-50%)}
.lbnext{right:28px;top:50%;transform:translateY(-50%)}
.lbtitle{position:absolute;left:90px;bottom:14px;color:#bcb8ae;font:12px Georgia,serif}
.lbmeta{display:grid;grid-template-columns:minmax(0,1.4fr) repeat(3,minmax(0,1fr)) auto;gap:20px;padding:16px 32px;border-top:1px solid #26241f;background:#0d0c0b;align-items:start;margin:0}
.lbmeta small{display:block;font:8px ui-monospace;letter-spacing:.12em;color:#77756e;margin-bottom:5px}
.lbmeta b{font:500 14px Georgia,serif;color:#e8e4dc}
.lbtags{display:flex;flex-wrap:wrap;gap:4px;margin-top:2px}
.lbsub{display:flex;justify-content:space-between;align-items:center;gap:18px;padding:0 32px 18px;background:#0d0c0b;color:#8c8980;font-size:10px;margin:0}
.lbsub p{margin:0;text-align:right;max-width:60%}
.lbsub a{color:#d6d1c5}
body.lightbox-open .bar,body.lightbox-open aside{display:none}
body.lightbox-open .layout{display:block;min-height:100vh;max-width:none}
body.lightbox-open .main{padding:0}
body.lightbox-open .notice{position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:5;margin:0;box-shadow:0 6px 20px #0008}
.tag{display:inline-block;padding:5px 8px;border:1px solid #393731;border-radius:20px;color:#99968d;font-size:8px}
.lbactions{display:flex;flex-direction:column;gap:7px}
.lbactions button{padding:8px 11px;border:1px solid #4b473e;background:#25231f;color:#eee7dc;border-radius:4px;font-size:9px;white-space:nowrap}
.lbactions button.on{border-color:#c2a77c;color:#e9d8b5}
.form{margin-top:22px;max-width:620px}
.formgrid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.field{display:block;margin-bottom:14px}
.field span{display:block;font:8px ui-monospace;letter-spacing:.12em;color:#8b887f;margin-bottom:6px}
.field input,.field select,.field textarea{width:100%;background:#191815;border:1px solid #34322d;border-radius:4px;color:#e9e5dc;padding:10px;font:10px system-ui}
.field textarea{min-height:76px;resize:vertical}
.field .hint{display:block;color:#77756e;font-size:8px;margin-top:5px}
.form .actions{display:flex;gap:9px;align-items:center}
.form .button{padding:10px 14px;border-radius:4px;background:#c2a77c;color:#1b1710;border:1px solid #c2a77c;font-size:9px}
.form .cancel{color:#8c8980;font-size:9px}
.form .cancel:hover{color:#d6d1c5}
.toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);padding:9px 13px;background:#e9e0d0;color:#1a1814;border-radius:4px;display:none;font-size:10px}
.toast.show{display:block}
@media(max-width:1050px){.photos{columns:3}.lbmeta{grid-template-columns:1fr 1fr}.albumgrid{grid-template-columns:1fr}}
@media(max-width:780px){.layout{grid-template-columns:1fr}aside{display:none}.main{padding:22px}.photos{columns:2}.bar{padding:0 18px}.bar nav{display:none}.formgrid{grid-template-columns:1fr}}
@media(max-width:450px){.photos{columns:1}.head{display:block}.head .button,.head button{margin-top:15px}}
`
