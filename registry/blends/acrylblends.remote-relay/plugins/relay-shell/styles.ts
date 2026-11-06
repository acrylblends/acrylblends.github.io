/** The operations-console look, from design/mockup.html: a dark terminal workspace with green for live state and gold for warnings; a light scheme for people whose system asks for one. */
export const RELAY_STYLES = `
:root{--bg:#101316;--side:#191f24;--term:#080b0d;--line:#303a40;--ink:#e3e9e9;--muted:#89999e;--green:#9be477;--gold:#e2be75;--card:#171d21;--hostline:#7aa66a;--hostbg:#202c27;--tabs:#14191d;--label:#718188;--btn:#283730;--btnline:#506d4a;--inputbar:#0b1012;--out:#b4c0c0;--dim:#67777b;--on-green:#101316;--red:#ff9a8f;--envline:#415044;--auditline:#52665a;color-scheme:dark}
@media (prefers-color-scheme:light){:root{--bg:#f1f4f3;--side:#e6ecea;--term:#10161a;--line:#c5d0cd;--ink:#1b2628;--muted:#56686c;--green:#2c7a1c;--gold:#946a0d;--card:#fff;--hostline:#5e9a4c;--hostbg:#e2efe0;--tabs:#dde6e3;--label:#5c6f73;--btn:#e2efe0;--btnline:#8fb784;--inputbar:#dfe7e4;--out:#c4cfcf;--dim:#7d8d91;--on-green:#fff;--red:#b3261e;--envline:#9fc08f;--auditline:#8fb09c;color-scheme:light}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace}a{color:inherit;text-decoration:none}
.top{height:58px;border-bottom:1px solid var(--line);display:flex;align-items:center;padding:0 18px;gap:14px}.logo{font:800 18px Inter,system-ui,sans-serif}.logo span{color:var(--green)}.env{font-size:10px;border:1px solid var(--envline);color:var(--green);padding:5px 8px;border-radius:4px}.spacer{flex:1}
.top button,.top .btn{background:var(--green);color:var(--on-green);border:0;border-radius:4px;padding:9px 13px;font:800 13px Inter,system-ui,sans-serif;cursor:pointer}
.layout{display:grid;grid-template-columns:230px 1fr 220px;min-height:calc(100vh - 58px)}.left,.right{background:var(--side);padding:16px;overflow:auto}.left{border-right:1px solid var(--line)}.right{border-left:1px solid var(--line)}
.label{color:var(--label);font-size:9px;letter-spacing:.16em;margin:9px 0 13px;text-transform:uppercase}
.host{display:block;padding:11px;border:1px solid var(--line);border-radius:6px;margin-bottom:8px}.host.active{border-color:var(--hostline);background:var(--hostbg)}.host b{display:block;font-size:11px}.host small{color:var(--muted);font-size:9px}.dot{color:var(--green);margin-right:6px}.dot.warn{color:var(--gold)}
.tabs{display:flex;background:var(--tabs);border-bottom:1px solid var(--line)}.tabs a{color:var(--muted);padding:12px 15px;font-size:10px;border-bottom:2px solid transparent}.tabs a.active{color:var(--green);border-bottom-color:var(--green)}
.main{min-width:0;display:flex;flex-direction:column}.sessionbar{min-height:50px;display:flex;align-items:center;padding:0 17px;border-bottom:1px solid var(--line);gap:14px;color:var(--muted);font-size:10px;flex-wrap:wrap}.sessionbar b{color:var(--ink)}
.badge{color:var(--green)}.badge.warn,.status{color:var(--gold);font-size:9px}.badge.bad{color:var(--red)}
.term{background:var(--term);flex:1;padding:19px;overflow:auto;font-size:12px;line-height:1.7;min-height:360px;max-height:calc(100vh - 230px);color:#e3e9e9}.line{white-space:pre-wrap}.prompt{color:#9be477}.out{color:var(--out)}.dim{color:var(--dim)}.out.bad{color:#ff9a8f}
.cmdline{display:flex;gap:9px;align-items:center;margin:0}.cmdline input{flex:1;background:transparent;border:0;outline:0;color:#9be477;font:inherit;min-width:20px}
.inputbar{background:var(--inputbar);border-top:1px solid var(--line);padding:13px 18px;display:flex;gap:9px;flex-wrap:wrap;align-items:center}.inputbar form{display:inline}
.inputbar button,.smallbtn{background:var(--btn);color:var(--green);border:1px solid var(--btnline);border-radius:4px;padding:8px 10px;cursor:pointer;font:inherit;font-size:10px;display:inline-block}
.panel{padding:20px;overflow:auto}.card{border:1px solid var(--line);border-radius:7px;padding:14px;margin-bottom:12px;background:var(--card)}.card h3{font-size:11px;margin:0 0 12px;text-transform:uppercase}
.row{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--line);font-size:10px;align-items:center}.muted{color:var(--muted)}.row form{display:inline}
.audit{font-size:10px;border-left:1px solid var(--auditline);padding:8px 0 8px 13px;margin-left:4px}
.right .row{display:block}.right .row b{display:block;margin-bottom:3px}.right .row span{color:var(--muted)}
.alert{margin:12px 17px 0;padding:9px 12px;border-radius:5px;border:1px solid var(--line);font-size:11px}.alert.ok{border-color:var(--btnline);color:var(--green)}.alert.error{border-color:var(--red);color:var(--red)}
.empty{padding:28px;text-align:center;color:var(--muted)}
.field{display:grid;gap:5px;font-size:10px;color:var(--muted);margin-bottom:10px}.input{width:100%;background:var(--inputbar);color:var(--ink);border:1px solid var(--line);border-radius:4px;padding:7px 8px;font:inherit;font-size:11px}
details.add summary{list-style:none;cursor:pointer;text-align:center}details.add summary::-webkit-details-marker{display:none}details.add[open] summary{margin-bottom:10px}
a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid var(--green);outline-offset:2px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
@media(max-width:1050px){.layout{grid-template-columns:200px 1fr}.right{display:none}}
@media(max-width:680px){.layout{display:block}.left{display:none}.term{min-height:340px}.sessionbar{font-size:9px}.top{padding:0 12px;gap:8px}.env{display:none}}
`
