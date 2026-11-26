# Генератор фонов портала: python3 web/scripts/backgrounds.py synthwave dusk ... (из корня репо; нужны numpy и Pillow)
import numpy as np, sys
from PIL import Image, ImageFilter
W,H=2560,1600
R=np.random.default_rng
Y,X=np.mgrid[0:H,0:W].astype(np.float32)
x=np.arange(W,dtype=np.float32); xn=x/W; yn=Y/H
def c(h): h=h.lstrip('#'); return np.array([int(h[i:i+2],16) for i in (0,2,4)],np.float32)/255
def vgrad(stops):
    ps=[p for p,_ in stops]; out=np.zeros((H,W,3),np.float32)
    t=Y/H
    for k in range(3): out[...,k]=np.interp(t,ps,[c(col)[k] for _,col in stops])
    return out
def noise1(seed,octaves=6,base=3,pers=0.5):
    r=R(seed); h=np.zeros(W,np.float32); a=1;f=base;tot=0
    for _ in range(octaves):
        pts=r.random(int(f)+2); u=xn*f; i=u.astype(int); fr=u-i; s=(1-np.cos(fr*np.pi))/2
        h+=a*(pts[i]*(1-s)+pts[i+1]*s); tot+=a; a*=pers; f*=2
    return h/tot
def layer(img,top,col,blend=None):
    m=np.clip(Y-top[None,:]+0.5,0,1)[...,None]
    cc=c(col) if isinstance(col,str) else col
    img[:]=img*(1-m)+cc*m
def glow(img,cx,cy,r,col,strength=1.0):
    d=((X-cx)**2+(Y-cy)**2)/(r*r); g=np.exp(-d)[...,None]*strength
    img[:]=img+(c(col)-img)*np.clip(g,0,1)
def disc(img,cx,cy,r,colfn):
    d=np.sqrt((X-cx)**2+(Y-cy)**2); m=np.clip(r-d+0.5,0,1)[...,None]
    img[:]=img*(1-m)+colfn*m
def stars(img,n,seed,maxy=1.0,bright=1.0):
    r=R(seed); xs=r.random(n)*W; ys=(r.random(n)**1.5)*H*maxy; s=r.random(n)**3*1.6+0.4; b=r.random(n)*bright
    for xx,yy,ss,bb in zip(xs,ys,s,b):
        x0,x1=int(max(xx-6,0)),int(min(xx+7,W)); y0,y1=int(max(yy-6,0)),int(min(yy+7,H))
        g=np.exp(-((X[y0:y1,x0:x1]-xx)**2+(Y[y0:y1,x0:x1]-yy)**2)/(ss*ss))*bb
        img[y0:y1,x0:x1]+= (1-img[y0:y1,x0:x1])*g[...,None]
def mesh(points,sharp=2.2):
    num=np.zeros((H,W,3),np.float32); den=np.zeros((H,W),np.float32)
    for px,py,col,wt in points:
        d=((X/W-px)**2+((Y/H-py)*H/W)**2)+1e-4; w=wt/d**sharp*1e-6
        num+=w[...,None]*c(col); den+=w
    return num/den[...,None]
def save(img,name):
    r=R(7); img=img+r.normal(0,1.1/255,img.shape).astype(np.float32)
    im=Image.fromarray((np.clip(img,0,1)*255+0.5).astype(np.uint8))
    im.save(f'web/public/bg/{name}.webp',quality=90,method=6)
    im.resize((1280,800),Image.LANCZOS).save(f'web/public/bg/{name}-1280.webp',quality=88,method=6)
    t=im.resize((320,200),Image.LANCZOS); t.save(f'web/public/bg/{name}-thumb.webp',quality=85,method=6)
    a=np.asarray(im.resize((64,40))).reshape(-1,3).mean(0).astype(int); print(name,f'rgb({a[0]} {a[1]} {a[2]})')

def synthwave():
    img=vgrad([(0,'#1a0b3d'),(0.35,'#5b1a8a'),(0.58,'#e0457b'),(0.66,'#ff9a5a')])
    stars(img,500,1,0.5,0.8)
    cx,cy,rr=W*0.5,H*0.52,H*0.24
    sun=vgrad([(0.28,'#fff36b'),(0.5,'#ff8a4c'),(0.76,'#ff2d7a')])
    d=np.sqrt((X-cx)**2+(Y-cy)**2); m=np.clip(rr-d+0.5,0,1)
    t=(Y-(cy-rr))/(2*rr); stripes=np.where((t>0.5)&(np.sin(t*(10+t*40)*np.pi*1.2)>(1.6-2*t)),0,1)
    glow(img,cx,cy,rr*1.9,'#ff5fa2',0.55)
    m=(m*stripes)[...,None]; img[:]=img*(1-m)+sun*m
    hz=H*0.66
    layer(img,hz-90-noise1(3,5,4)*230*np.clip(1-np.abs(xn-0.5)*0.4,0,1)**2*np.clip(np.abs(xn-0.5)*3,0,1),'#3a1260')
    layer(img,hz-30-noise1(4,6,6)*120*np.clip(np.abs(xn-0.5)*2.5,0,1),'#250a46')
    g=vgrad([(0.66,'#1b0636'),(1,'#0b0220')]); m=(Y>=hz)[...,None]; img[:]=np.where(m,g,img)
    yy=(Y-hz)/(H-hz)+1e-3; lines=np.zeros((H,W),np.float32)
    zl=1/yy; hl=np.abs(((zl*1.0)%1)-0.5); lines=np.maximum(lines,np.clip(1-hl/(0.02*zl+0.002)*0.9,0,1)*(Y>hz))
    vx=(X-W/2)/(yy*W)*8; vl=np.abs((vx%1)-0.5); lines=np.maximum(lines,np.clip(1-vl/(0.035/yy*yy*1.5+0.012/yy*0.08+0.02),0,1)*(Y>hz))
    lines*=np.clip(yy*3,0,1)
    img[:]=img+(c('#ff4fd8')-img)*lines[...,None]*0.85
    glow(img,cx,hz,W*0.35,'#ff4fb0',0.25)
    save(img,'synthwave')

def dusk():
    img=vgrad([(0,'#2b1b5a'),(0.35,'#8a3f8f'),(0.6,'#ff7a6b'),(0.8,'#ffc27a')])
    glow(img,W*0.68,H*0.56,H*0.5,'#ffd59a',0.7)
    disc(img,W*0.68,H*0.56,H*0.08,c('#fff1c9'))
    cols=['#d9748a','#b05a86','#7f4580','#55346f','#33245a','#1d1740']
    for i,col in enumerate(cols):
        base=H*(0.5+i*0.085); amp=H*(0.22-i*0.02)
        layer(img,base-noise1(10+i,7,2+i,0.52)*amp,col)
    save(img,'dusk')

def aurora():
    img=vgrad([(0,'#030a1f'),(0.5,'#0a1f3d'),(0.85,'#123a52')])
    stars(img,1400,2,0.85,1.0)
    for k,(col,off,amp,wd,st) in enumerate([('#2cffb0',0.32,0.10,0.08,0.75),('#7a5cff',0.22,0.08,0.06,0.55),('#26e0ff',0.42,0.06,0.05,0.5)]):
        cy=H*(off+amp*np.sin(xn*np.pi*2.2+k*1.7)+0.04*np.sin(xn*np.pi*7+k))
        d=(Y-cy[None,:])/(H*wd)
        curtain=np.where(d<0,np.exp(-d*d*1.5),np.exp(-d*d*0.15))*np.exp(-np.maximum(d,0)*0.6)
        rays=0.6+0.4*np.sin(X*0.035+np.sin(X*0.004)*6)**2
        g=(curtain*rays*st)[...,None]
        img[:]=img+(c(col)-img)*np.clip(g,0,1)*0.9
    layer(img,H*0.72-noise1(21,7,3)*H*0.22,'#0b1830')
    # pines
    r=R(5); top=np.full(W,H*1.0,np.float32)
    base=H*0.9-noise1(22,4,2)*H*0.05
    for _ in range(140):
        px=r.random()*W; ht=H*(0.07+r.random()*0.12); wd=ht*0.28
        tip=base[int(px)]-ht; prof=tip+np.abs(x-px)/wd*ht + 6*np.abs(np.sin((x-px)*0.25))*(np.abs(x-px)<wd)
        top=np.minimum(top,prof)
    top=np.minimum(top,base)
    layer(img,top,'#040a16')
    save(img,'aurora')

def candy():
    img=mesh([(0.1,0.15,'#ff6ec4',1),(0.55,0.05,'#ffb86b',1),(0.95,0.2,'#7873f5',1.2),(0.25,0.75,'#7cf0ff',1),(0.7,0.65,'#ff5f8f',1.1),(1.0,0.95,'#ffd36b',0.8),(0.0,1.0,'#a26bff',0.9),(0.45,0.4,'#ffa3d7',0.7)])
    save(img,'candy')
def lagoon():
    img=mesh([(0.05,0.1,'#00d4c8',1),(0.5,0.0,'#6ee7ff',0.8),(0.95,0.1,'#3b5bff',1.1),(0.2,0.8,'#b8ff6b',0.9),(0.65,0.55,'#00a3ff',1),(0.95,0.9,'#7b2fff',1),(0.4,0.35,'#5effc8',0.7),(0.0,0.5,'#0fb8a0',0.6)])
    save(img,'lagoon')

def waves():
    img=vgrad([(0,'#ff9e7a'),(0.3,'#ffc38a'),(0.45,'#ffe0a8')])
    glow(img,W*0.3,H*0.42,H*0.35,'#fff4d6',0.8)
    disc(img,W*0.3,H*0.42,H*0.09,c('#fffaf0'))
    cols=['#7fd6d0','#4fb8c4','#2e93b3','#22709c','#1b4f80','#173866']
    for i,col in enumerate(cols):
        base=H*(0.46+i*0.095); amp=H*(0.03+i*0.012)
        ph=i*1.3; f=2.5+i*0.6
        top=base-amp*(np.sin(xn*np.pi*f+ph)+0.35*np.sin(xn*np.pi*f*2.7+ph*2))
        layer(img,top,col)
        # foam crest
        m=np.clip(1-np.abs(Y-top[None,:]-3)/3,0,1)[...,None]*0.35
        img[:]=img+(1-img)*m
    save(img,'waves')

def dunes():
    img=vgrad([(0,'#ff8fb1'),(0.35,'#ffb38a'),(0.55,'#ffd9a0')])
    glow(img,W*0.78,H*0.36,H*0.3,'#fff0c8',0.7); disc(img,W*0.78,H*0.36,H*0.07,c('#fff8e6'))
    cols=[('#f7a98a','#e88b7a'),('#ef8f74','#d06a6a'),('#d86f6a','#b0505f'),('#b24f62','#87394f'),('#7e3550','#5a2442')]
    for i,(a,b) in enumerate(cols):
        base=H*(0.55+i*0.1); amp=H*(0.09-i*0.008)
        top=base-amp*(np.sin(xn*np.pi*(1.4+i*0.5)+i*2.1)*0.6+noise1(40+i,3,2)*0.8)
        # shade: left/right lit
        tt=np.clip((Y-top[None,:])/(H*0.12),0,1)[...,None]
        slope=np.gradient(top)[None,:,None]; lit=np.clip(0.5-slope*0.8,0,1)
        colr=(c(a)*lit+c(b)*(1-lit))*(1-tt*0.25)+c(b)*tt*0.25
        m=np.clip(Y-top[None,:]+0.5,0,1)[...,None]; img[:]=img*(1-m)+colr*m
    save(img,'dunes')

def nightforest():
    img=vgrad([(0,'#0d1b4a'),(0.5,'#28407a'),(0.8,'#5b6fae')])
    stars(img,900,8,0.6,0.9)
    glow(img,W*0.25,H*0.25,H*0.3,'#c9d6ff',0.45); disc(img,W*0.25,H*0.25,H*0.065,c('#f4f1ff'))
    r=R(9)
    for li,(col,b,hmin,hmax,n) in enumerate([('#3d4f8c',0.62,0.08,0.18,90),('#2a3870',0.74,0.12,0.24,70),('#18224d',0.88,0.16,0.32,50),('#0b112d',1.02,0.25,0.45,26)]):
        top=np.full(W,H*b,np.float32)-noise1(60+li,4,2)*H*0.05
        base=top.copy()
        for _ in range(n):
            px=r.random()*W; ht=H*(hmin+r.random()*(hmax-hmin)); wd=ht*0.22
            tip=base[int(px)]-ht; prof=tip+np.abs(x-px)/wd*ht+8*np.abs(np.sin((x-px)*0.18))*(np.abs(x-px)<wd)
            top=np.minimum(top,prof)
        layer(img,top,col)
        if li<3: img[:]=img+(c('#8fa3e0')-img)*np.clip((Y-H*0.5)/H,0,0.4)[...,None]*0.15*(3-li)/3
    save(img,'nightforest')

for f in sys.argv[1:]: globals()[f]()
