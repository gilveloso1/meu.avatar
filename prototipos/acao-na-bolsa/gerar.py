import json,re,html
w=json.load(open('palavras.json'))
# correções da transcrição
fix=[]
i=0
while i<len(w):
    x=dict(w[i])
    if x['p']=='ivemos': x['p']='tivemos'
    if x['p']=='Zil.': x['p']='Sil.'
    if x['p']=='palavra,': x['p']='palavra:'
    if x['p']=='10' and w[i+1]['p']=='%': x['p']='10%'; x['b']=w[i+1]['b']; i+=1
    fix.append(x); i+=1
# onde já há texto na tela, a legenda sai: o motion do histórico e cada gráfico
T=lambda t:t if t<14.2 else round(t+.1,3)
COM_TEXTO=[(.4,4.85),(6.58,7.42),(9.6,11.95),(12.3,14.3),(T(14.2),T(24.75)),(T(26.6),T(27.68)),(T(28.15),T(30.05)),(T(30.4),T(32.95)),(T(33.1),T(36.1)),(T(38.85),40.5)]
fix=[x for x in fix if not any(a<(x['a']+x['b'])/2<b for a,b in COM_TEXTO)]
# blocos de legenda: até 3 palavras/20 letras, quebra em pontuação ou pausa
ch=[];cur=[]
for j,x in enumerate(fix):
    cur.append(x)
    nx=fix[j+1] if j+1<len(fix) else None
    txt=' '.join(c['p'] for c in cur)
    if not nx or x['p'][-1] in '.,?:' or nx['a']-x['b']>0.25 or len(cur)>=4 or len(txt)+len(nx['p'])>24:
        ch.append(cur);cur=[]
# palavra curta sozinha não vira legenda: entra na anterior
for n in range(len(ch)-1,0,-1):
    if len(ch[n])==1 and len(ch[n][0]['p'])<=3 and ch[n][0]['a']-ch[n-1][-1]['b']<.3: ch[n-1]+=ch.pop(n)
sp=[];js=[]
for n,c in enumerate(ch):
    a=c[0]['a']; b=(ch[n+1][0]['a'] if n+1<len(ch) else 40.3)
    b=min(b,c[-1]['b']+0.35,*[p for p,_ in COM_TEXTO if p>a])
    words=''.join(f'<span class="w" id="w{n}_{k}">{html.escape(x["p"].upper())}</span> ' for k,x in enumerate(c))
    sp.append(f'<div class="cap" id="c{n}">{words}</div>')
    js.append(f'tl.set("#c{n}",{{autoAlpha:1}},{a:.3f});tl.fromTo("#c{n}",{{scale:.88}},{{scale:1,duration:.12,ease:"back.out(3)"}},{a:.3f});tl.set("#c{n}",{{autoAlpha:0}},{b:.3f});')
    for k,x in enumerate(c):
        js.append(f'tl.set("#w{n}_{k}",{{color:"#46ff96"}},{x["a"]:.3f});')
        if k+1<len(c): js.append(f'tl.set("#w{n}_{k}",{{color:"#ffffff"}},{c[k+1]["a"]:.3f});')
open('caps.txt','w').write(' | '.join(' '.join(x['p'] for x in c) for c in ch))
page=f'''<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"/><meta name="viewport" content="width=720, height=1280"/>
<script src="gsap.min.js"></script><style>
@font-face{{font-family:"Inter";src:url("Inter-400.woff2") format("woff2");font-weight:400}}
@font-face{{font-family:"Inter";src:url("Inter-700.woff2") format("woff2");font-weight:700}}
@font-face{{font-family:"Inter";src:url("Inter-900.woff2") format("woff2");font-weight:900}}
html,body{{margin:0;background:transparent}}
#root{{position:relative;width:720px;height:1280px;overflow:hidden;font-family:"Inter",sans-serif;font-weight:700;color:#fff}}
.cap{{position:absolute;left:150px;width:420px;top:990px;text-align:center;font-size:44px;font-weight:900;line-height:1.14;letter-spacing:-.3px;text-wrap:balance;visibility:hidden;text-shadow:0 0 8px #000,0 3px 0 #000,3px 0 0 #000,-3px 0 0 #000,0 -3px 0 #000}}
.g{{position:absolute;opacity:0}}
.card{{left:40px;right:40px;top:640px;padding:22px 26px;border-radius:24px;background:rgba(8,19,29,.86);border:2px solid rgba(70,255,150,.45);box-sizing:border-box}}
.k{{font-size:22px;letter-spacing:4px;color:#46ff96}}
.linha{{display:flex;align-items:center;gap:14px;margin-top:14px;font-size:30px}}
.nome{{width:120px}}
.barra{{height:42px;border-radius:8px;transform-origin:left}}
.vb{{font-size:58px;letter-spacing:-1px}}
.verde{{color:#46ff96}}.verm{{color:#ff6b5e}}
#conf{{left:0;right:0;top:700px;text-align:center;font-size:86px;letter-spacing:-2px;color:#46ff96;text-shadow:0 0 34px rgba(70,255,150,.8),0 4px 0 #000}}
#juros{{left:40px;top:660px;padding:18px 30px;border-radius:24px;background:#46ff96;color:#08131d;font-size:64px;letter-spacing:-1px}}
#juros small{{display:block;font-size:26px;letter-spacing:0}}
#duelo{{left:40px;right:40px;top:690px;display:grid;grid-template-columns:1fr 1fr;gap:18px}}
#duelo div{{padding:22px;border-radius:22px;background:rgba(8,19,29,.88);border:2px solid rgba(255,255,255,.25);text-align:center;font-size:44px}}
#selo{{left:50px;top:690px;padding:16px 28px;border:6px solid #ff6b5e;border-radius:14px;color:#ff6b5e;background:rgba(8,19,29,.9);font-size:46px;transform:rotate(-5deg);line-height:1.1}}
#selo small{{display:block;font-size:26px;color:#fff}}
#pais{{left:0;right:0;top:680px;text-align:center;font-size:150px;letter-spacing:-4px;text-shadow:0 6px 0 #000,0 0 30px rgba(0,0,0,.7)}}
#medidor .trilha{{height:30px;border-radius:15px;background:rgba(255,255,255,.14);margin-top:16px;overflow:hidden}}
#medidor .fill{{height:100%;width:100%;background:#46ff96;transform-origin:left}}
#cta{{left:60px;right:60px;top:720px;padding:22px;border-radius:40px;background:#46ff96;color:#08131d;text-align:center;font-size:44px}}
</style></head><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="40.3" data-width="720" data-height="1280">
<div class="g card" id="div"><div class="k">DÍVIDA DO PAÍS</div>
<div class="linha"><span class="nome">Japão</span><div class="barra" id="b1" style="width:360px;background:#ff6b5e"></div><span class="vb verm" id="tres">3×</span></div>
<div class="linha"><span class="nome">Brasil</span><div class="barra" id="b2" style="width:120px;background:#9fb3ac"></div></div>
<div class="linha" id="inv"><span class="verde">+ investidores no Japão</span></div></div>
<div class="g" id="conf">CONFIANÇA</div>
<div class="g" id="juros">10%<small>de juros</small></div>
<div class="g" id="duelo"><div>BRASIL</div><div>EUA</div></div>
<div class="g" id="selo">POUPANÇA CONFISCADA<small>Plano Collor · 1990</small></div>
<div class="g" id="pais"><span id="bra">BRA</span><span id="zil" class="verde">SIL</span></div>
<div class="g card" id="deve"><div class="k">NÃO BASTA SABER</div><div class="linha" style="font-size:40px">Quanto o país deve</div></div>
<div class="g card" id="medidor"><div class="k">É PRECISO SABER</div><div class="linha" style="font-size:40px">Quanto o mundo confia</div><div class="trilha"><div class="fill" id="fill"></div></div></div>
<div class="g" id="cta">Siga o Ação na Bolsa</div>
{''.join(sp)}
</div>
<script>
window.__timelines=window.__timelines||{{}};const tl=gsap.timeline({{paused:true}});
const mostra=(el,a,b)=>{{tl.fromTo(el,{{y:30,opacity:0}},{{y:0,opacity:1,duration:.22,ease:"power3.out"}},a);tl.to(el,{{opacity:0,duration:.18}},b-.18);}};
mostra("#div",.4,4.85);
tl.fromTo("#b1",{{scaleX:0}},{{scaleX:1,duration:.5,ease:"power2.out"}},.5);tl.fromTo("#b2",{{scaleX:0}},{{scaleX:1,duration:.4,ease:"power2.out"}},1.95);
tl.fromTo("#tres",{{scale:0}},{{scale:1,duration:.3,ease:"back.out(3)"}},.86);tl.fromTo("#inv",{{opacity:0}},{{opacity:1,duration:.2}},3.8);
mostra("#conf",6.58,7.42);tl.fromTo("#conf",{{scale:.7}},{{scale:1,duration:.35,ease:"back.out(2.4)"}},6.58);
mostra("#juros",9.6,11.95);mostra("#duelo",12.3,14.2);
mostra("#selo",26.7,27.78);tl.fromTo("#selo",{{scale:1.6}},{{scale:1,duration:.2,ease:"power4.in"}},26.7);
tl.set("#pais",{{opacity:1}},28.25);tl.fromTo("#bra",{{opacity:0}},{{opacity:1,duration:.1}},28.25);tl.fromTo("#zil",{{opacity:0}},{{opacity:1,duration:.1}},29.3);tl.to("#pais",{{opacity:0,duration:.15}},30.05);
mostra("#deve",30.5,33.05);mostra("#medidor",33.2,36.2);tl.fromTo("#fill",{{scaleX:0}},{{scaleX:.92,duration:1.1,ease:"power2.out"}},34.8);
mostra("#cta",38.97,40.3);tl.fromTo("#cta",{{scale:.8}},{{scale:1,duration:.3,ease:"back.out(3)"}},38.97);
{''.join(js)}
tl.set({{}},{{}},40.3);window.__timelines.main=tl;
</script></body></html>'''
open('over/index.html','w').write(page)
print(len(ch))
