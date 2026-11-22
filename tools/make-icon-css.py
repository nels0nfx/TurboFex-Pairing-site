import os
# Run: python3 tools/make-icon-css.py   Builds pairsite/public/tf2-icons.css from a small table (so every icon follows the same rules).
def A(v,u='px'): return 'calc(var(--a,1) * %s%s)'%(v,u)
def S(base,k): return 'calc(%s + var(--a,1) * %s)'%(base,k)
def T(x=0,y=0): return 'translate(%s,%s)'%(A(x) if x else '0',A(y) if y else '0')
def R(d): return 'rotate(%s)'%A(d,'deg')

KF={
 'dl':   '0@,60@,100@{transform:translateY(0)}22@,36@{transform:translateY(%s)}'%A(3),
 'l1':   '0@,100@{transform:translate(0,0)}28@,50@{transform:translate(%s,%s)}66@{transform:translate(%s,%s)}80@{transform:translate(0,0)}'%(A(1.7),A(-1.7),A(-.5),A(.5)),
 'l2':   '0@,100@{transform:translate(0,0)}28@,50@{transform:translate(%s,%s)}66@{transform:translate(%s,%s)}80@{transform:translate(0,0)}'%(A(-1.7),A(1.7),A(.5),A(-.5)),
 'plug': '0@,66@,100@{transform:translate(0,0) rotate(0)}20@{transform:translate(0,%s) %s}44@{transform:translate(0,%s) %s}56@{transform:translate(0,0) rotate(0)}'%(A(-1.4),R(-10),A(.8),R(4)),
 'book': '0@,66@,100@{transform:perspective(70px) rotateY(0)}32@{transform:perspective(70px) rotateY(%s)}'%A(-28,'deg'),
 'book2':'0@,66@,100@{transform:scaleX(1)}32@{transform:scaleX(%s)}'%S('1','-.16'),
 'flask':'0@,100@{transform:rotate(0)}25@{transform:%s}75@{transform:%s}'%(R(-4),R(4)),
 'bub':  '0@{opacity:0;transform:translateY(0) scale(.5)}25@{opacity:.95}80@{opacity:.5;transform:translateY(%s) scale(1)}100@{opacity:0;transform:translateY(%s) scale(1)}'%(A(-5),A(-6.5)),
 'cr':   '0@,62@,100@{transform:translateX(0)}25@{transform:translateX(%s)}42@{transform:translateX(%s)}'%(A(2.2),A(-.8)),
 'cl':   '0@,62@,100@{transform:translateX(0)}25@{transform:translateX(%s)}42@{transform:translateX(%s)}'%(A(-2.2),A(.8)),
 'slash':'0@,62@,100@{transform:scaleY(1)}25@{transform:scaleY(%s)}42@{transform:scaleY(.94)}'%S('1','.16'),
 'cur':  '0@,100@{transform:scaleX(1);opacity:1}10@{transform:scaleX(.25);opacity:1}38@{transform:scaleX(1);opacity:1}50@,66@{opacity:0}58@,74@{opacity:1}',
 'chv':  '0@,60@,100@{transform:translateX(0)}22@{transform:translateX(%s)}'%A(1.2),
 'drop': '0@,60@,100@{transform:translateY(0) scale(1,1)}20@{transform:translateY(%s)}42@{transform:translateY(%s) scale(1.05,.94)}54@{transform:translateY(0) scale(1,1)}'%(A(-2.4),A(1)),
 'sh':   '0@,70@,100@{transform:scale(1)}30@{transform:scale(%s)}'%S('1','.07'),
 'draw': '0@{stroke-dashoffset:0}10@{stroke-dashoffset:1}42@,100@{stroke-dashoffset:0}',
 'lock': '0@,70@,100@{transform:translateY(0)}22@,46@{transform:translateY(%s)}'%A(-1.6),
 'tick': '0@,8@{transform:rotate(0)}50@{transform:rotate(180deg)}100@{transform:rotate(360deg)}',
 'key':  '0@,70@,100@{transform:rotate(0)}20@{transform:%s}40@{transform:%s}55@{transform:rotate(0)}'%(R(-16),R(10)),
 'blink':'0@,86@,100@{transform:scaleY(1)}92@{transform:scaleY(.1)}',
 'look': '0@,100@{transform:translateX(0)}30@{transform:translateX(%s)}65@{transform:translateX(%s)}'%(A(-1.6),A(1.6)),
 'scan': '0@,100@{transform:translate(0,0) rotate(0)}25@{transform:translate(%s,%s) %s}50@{transform:translate(%s,%s) %s}75@{transform:translate(%s,%s) rotate(0)}'%(A(-1.1),A(-1.1),R(-8),A(1.1),A(-1.2),R(8),A(.5),A(.8)),
 'fly':  '0@,60@,100@{transform:translate(0,0);opacity:1}30@{transform:translate(%s,%s);opacity:0}31@{transform:translate(%s,%s);opacity:0}'%(A(3),A(-3),A(-3),A(3)),
 'pop':  '0@,60@,100@{transform:scale(1) rotate(0)}30@{transform:scale(%s) %s}'%(S('1','.14'),R(-6)),
 'wig':  '0@,60@,100@{transform:rotate(0)}15@{transform:%s}30@{transform:%s}45@{transform:%s}'%(R(-9),R(8),R(-4)),
 'exit': '0@,60@,100@{transform:translateX(0)}25@{transform:translateX(%s)}40@{transform:translateX(%s)}'%(A(2.6),A(.6)),
 'nudge':'0@,60@,100@{transform:translateX(0)}30@{transform:translateX(%s)}'%A(3),
 'nudge2':'0@,60@,100@{transform:translateX(0)}30@{transform:translateX(%s)}'%A(2),
 'bob':  '0@,60@,100@{transform:translateY(0)}30@{transform:translateY(%s)}'%A(2),
 'r90':  '0@{transform:rotate(0)}100@{transform:rotate(90deg)}',
 'shake':'0@,60@,100@{transform:rotate(0)}8@{transform:%s}16@{transform:%s}24@{transform:%s}32@{transform:%s}40@{transform:rotate(0)}'%(R(-9),R(9),R(-6),R(4)),
 'spin': '0@{transform:rotate(0)}100@{transform:rotate(360deg)}',
 'sun':  '0@,100@{transform:rotate(0)}50@{transform:%s}'%R(60),
 'sway': '0@,100@{transform:rotate(0)}30@{transform:%s}60@{transform:%s}'%(R(-18),R(8)),
 'bu1':  '0@,100@{transform:translateX(0)}40@{transform:translateX(%s)}'%A(2.2),
 'bu2':  '0@,100@{transform:translateX(0)}40@{transform:translateX(%s)}'%A(-2.2),
 'hop':  '0@,60@,100@{transform:translateY(0)}25@{transform:translateY(%s)}'%A(-1.8),
 'bar':  '0@{transform:scaleY(.45)}60@{transform:scaleY(1.08)}100@{transform:scaleY(1)}',
 'dots': '0@,100@{opacity:1}30@{opacity:.2}',
 'wave': '0@,60@,100@{transform:translateX(0);opacity:1}25@{transform:translateX(%s);opacity:.25}'%A(1.8),
 'line': '0@{transform:scaleX(.3)}60@{transform:scaleX(1)}100@{transform:scaleX(1)}',
 'cog':  '0@,100@{transform:rotate(0)}50@{transform:%s}'%R(60),
 'mer':  '0@,100@{transform:scaleX(1)}50@{transform:scaleX(.35)}',
 'twk':  '0@,60@,100@{transform:scale(1) rotate(0)}30@{transform:scale(%s) %s}'%(S('1','.18'),R(16)),
 'flash':'0@,60@,100@{opacity:1;transform:scale(1)}20@{opacity:.45}40@{opacity:1;transform:scale(%s)}'%S('1','.14'),
 'sl1':  '0@,100@{transform:translateX(0)}40@{transform:translateX(%s)}'%A(-3),
 'sl2':  '0@,100@{transform:translateX(0)}40@{transform:translateX(%s)}'%A(3),
 'flag': '0@,100@{transform:skewY(0)}30@{transform:skewY(%s)}65@{transform:skewY(%s)}'%(A(-8,'deg'),A(6,'deg')),
 'scn':  '0@{opacity:0;transform:translateY(-5px)}20@{opacity:1}80@{opacity:1}100@{opacity:0;transform:translateY(5px)}',
 'playp':'0@,60@,100@{transform:translateX(0) scale(1)}30@{transform:translateX(%s) scale(%s)}'%(A(1.2),S('1','.1')),
}

# key: (whole-or-part target, keyframe, idle seconds or None, hot seconds, extra delay, static css)
V='transform-box:view-box;transform-origin:12px 12px;'
TR={
 'dl':   [('.p2,.p3','dl',4.2,1.1,0,'')],
 'link': [('.p1','l1',4.8,1.2,0,''),('.p2','l2',4.8,1.2,0,'')],
 'plug': [('','plug',5,1.2,0,'')],
 'book': [('','book',5.4,1.3,0,'transform-origin:22% 50%;')],
 'book2':[('','book2',5.4,1.2,0,'')],
 'flask':[('','flask',3.6,1.2,0,'transform-origin:50% 85%;'),('.ibb1','bub',2.6,1.2,0,''),('.ibb2','bub',2.6,1.2,-.9,''),('.ibb3','bub',2.6,1.2,-1.7,'')],
 'code': [('.p1','cr',4.6,1.1,0,''),('.p2','cl',4.6,1.1,0,'')],
 'code2':[('.p1','cl',4.6,1.1,0,''),('.p2','cr',4.6,1.1,0,''),('.p3','slash',4.6,1.1,0,'')],
 'term': [('.p1','chv',3.4,1.2,0,''),('.p2','cur',3.4,1.4,0,'transform-origin:0% 50%;')],
 'box':  [('','drop',5.2,1.2,0,'')],
 'play': [('','playp',5,1.1,0,'')],
 'shield':[('','sh',5.6,1.2,0,''),('.p2','draw',5.6,1.4,0,'stroke-dasharray:1 1;')],
 'lock': [('.p2','lock',6,1.1,0,'')],
 'clock':[('.p2','tick',6,1.6,0,V)],
 'key':  [('','key',5.8,1.2,0,'transform-origin:33% 62%;')],
 'eye':  [('','blink',5.2,.9,0,''),('.p2',None,None,1.2,0,'')],
 'search':[('','scan',5.4,1.2,0,'')],
 'send': [('','fly',5.6,1.2,0,'')],
 'tg':   [('','pop',None,.9,0,'')],
 'wa':   [('','pop',None,.9,0,'')],
 'gh':   [('','wig',None,1,0,'')],
 'out':  [('.p2,.p3','exit',None,1,0,'')],
 'arrow':[('','nudge',None,.8,0,'')],
 'chev': [('','nudge2',None,.8,0,'')],
 'down': [('','bob',None,.8,0,'')],
 'plus': [('','r90',None,.45,0,'')],
 'close':[('','r90',None,.45,0,'')],
 'warn': [('','shake',6.5,1,0,'transform-origin:50% 90%;')],
 'copy': [('','pop',None,.8,0,'')],
 'refresh':[('','spin',None,.9,0,'')],
 'sun':  [('','sun',None,1.2,0,'')],
 'moon': [('','sway',None,1.2,0,'transform-origin:60% 40%;')],
 'burger':[('.p1','bu1',None,.7,0,''),('.p2','bu2',None,.7,0,'')],
 'lines':[('.p1','bu1',None,.7,0,''),('.p3','bu2',None,.7,0,'')],
 'home': [('','hop',None,.8,0,'')],
 'store':[('','hop',None,.8,0,'')],
 'user': [('.p1','hop',None,.8,0,'')],
 'people':[('.p1','hop',None,.8,0,'')],
 'chart':[('.p1','bar',None,.7,0,'transform-origin:50% 100%;'),('.p2','bar',None,.7,.1,'transform-origin:50% 100%;'),('.p3','bar',None,.7,.2,'transform-origin:50% 100%;')],
 'dash': [('.p1','bar',None,.7,0,'transform-origin:50% 100%;'),('.p2','bar',None,.7,.1,'transform-origin:50% 100%;'),('.p3','bar',None,.7,.2,'transform-origin:50% 100%;')],
 'server':[('.p3','dots',None,1.2,0,''),('.p4','dots',None,1.2,.3,'')],
 'pulse':[('','draw',None,1.2,0,'stroke-dasharray:1 1;')],
 'check':[('','draw',None,.8,0,'stroke-dasharray:1 1;')],
 'mega': [('.p2','wave',None,1,0,'')],
 'doc':  [('.p3','line',None,.8,0,'transform-origin:0% 50%;'),('.p4','line',None,.8,.12,'transform-origin:0% 50%;')],
 'gear': [('','cog',None,1.2,0,'')],
 'life': [('','cog',None,1.2,0,'')],
 'globe':[('.p3,.p4','mer',None,1.4,0,'')],
 'star': [('','twk',None,.9,0,'')],
 'bolt': [('','flash',None,.9,0,'')],
 'chat': [('','hop',None,.8,0,'')],
 'image':[('.p2','hop',None,.8,0,'')],
 'db':   [('.p1','hop',None,.8,0,'')],
 'sliders':[('.p5','sl1',None,1.2,0,''),('.p6','sl2',None,1.2,0,'')],
 'flag': [('.p2','flag',None,1.2,0,'transform-origin:0% 50%;')],
 'more': [('.p1','hop',None,.7,0,''),('.p2','hop',None,.7,.1,''),('.p3','hop',None,.7,.2,'')],
 'info': [('','pop',None,.8,0,'')],
 'qr':   [('.ibl','scn',None,1.2,0,'')],
}
# the eye pupil look
TR['eye'][1]=('.p2','look',None,1.2,0,'')
# same moves for these names
ALIAS={'puzzle':'plug','alert':'warn'}

HOT=':is(a,button,summary,li,.row,.pill,.tb,.cb,.srow,.pfind,.warnbox):is(:hover,:focus-visible,:active,:focus-within)'
out=[]
out.append('''/* TurboFex icon motion (v3.24.0). Each feature icon has one move that fits what it does, and the same icon moves the same way on every page.
   Only the drawing inside the icon moves (never the card or the tile). Colours are not touched.
   Idle: a slow, rare move, only while the icon is on screen (tf2-icons.js adds .ic-live). Hover, focus and tap: a slightly bigger move.
   Everything is inside the no-preference block, so Reduce Motion shows still icons. */
@media (prefers-reduced-motion: no-preference) {
svg[data-ic] { overflow: visible; }
svg[data-ic] * { transform-box: fill-box; transform-origin: center; }
html.ic-hide svg[data-ic], html.ic-hide svg[data-ic] * { animation-play-state: paused !important; }
svg[data-ic] .ib { fill: currentColor; stroke: none; opacity: 0; }
svg[data-ic] .ib.ibl { fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; }''')
for n,b in KF.items(): out.append('@keyframes tfi-%s{%s}'%(n,b.replace('@','%')))
out.append('.ic-s1{--dl:-.8s}.ic-s2{--dl:-1.7s}.ic-s3{--dl:-2.6s}.ic-s4{--dl:-3.5s}.ic-s5{--dl:-4.4s}.ic-s6{--dl:-5.3s}')
def sel(key,target): return 'svg[data-ic="%s"]%s'%(key,(' '+target) if target else '')
def parts(target): return [x.strip() for x in target.split(',')] if target else ['']
for key,tracks in TR.items():
    keys=[key]+[a for a,b in ALIAS.items() if b==key]
    for (target,kf,idle,hot,delay,static) in tracks:
        for k in keys:
            ps=parts(target)
            if static: out.append(','.join(sel(k,p) for p in ps)+'{'+static+'}')
            if kf is None: continue
            if idle:
                out.append(','.join('svg.ic-live[data-ic="%s"]%s'%(k,(' '+p) if p else '') for p in ps)+'{animation:tfi-%s %ss ease-in-out infinite;animation-delay:calc(var(--dl,0s) + %ss)}'%(kf,idle,delay))
            out.append(','.join(HOT+' '+sel(k,p) for p in ps)+'{--a:1.5;animation:tfi-%s %ss ease-in-out 3;animation-delay:%ss}'%(kf,hot,max(delay,0)))
# the eye also blinks on hover (whole svg) - handled by its first track
out.append('''
/* menu button: the two lines turn into a cross while the menu is open */
svg[data-ic="burger"] .p1, svg[data-ic="burger"] .p2 { transition: transform .26s cubic-bezier(.2,.8,.2,1); }
[aria-expanded="true"] svg[data-ic="burger"] .p1 { animation: none !important; transform: translateY(4px) rotate(45deg); }
[aria-expanded="true"] svg[data-ic="burger"] .p2 { animation: none !important; transform: translateY(-4px) rotate(-45deg); }
/* the active tab in the bottom bar pops once when it becomes active */
.tb.on svg[data-ic], .tb[aria-current="page"] svg[data-ic] { animation: tfi-pop .5s ease-out 1; }
}''')
open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','public','tf2-icons.css'),'w').write('\n'.join(out)+'\n')
print(len('\n'.join(out)),'bytes')
