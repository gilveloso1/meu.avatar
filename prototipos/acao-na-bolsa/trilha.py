import json,numpy as np,wave
sr=44100;dur=41.0;n=int(sr*dur);t=np.arange(n)/sr
bpm=104;beat=60/bpm;bar=beat*4
m=np.zeros((n,2))
chords=[[220,261.63,329.63],[174.61,220,261.63],[261.63,329.63,392],[196,246.94,293.66]] # Am F C G
bass=[110,87.31,130.81,98]
def env(start,length,attack=.01,rel=.25):
    i=(t>=start)&(t<start+length+rel);e=np.zeros(n);u=t[i]-start
    e[i]=np.minimum(u/attack,1)*np.where(u>length,np.exp(-(u-length)/rel*4),1);return e
for b in range(int(dur/bar)+1):
    s=b*bar;c=chords[b%4]
    for f in c:
        e=env(s,bar-.1,.4,.5)
        m[:,0]+=.05*e*(np.sin(2*np.pi*f*t)+.3*np.sin(2*np.pi*2.003*f*t))
        m[:,1]+=.05*e*(np.sin(2*np.pi*f*1.002*t)+.3*np.sin(2*np.pi*2*f*t))
    for k in range(8):                      # baixo em colcheias
        st=s+k*beat/2;e=env(st,beat/2-.05,.005,.06)
        x=.13*e*np.tanh(2.2*np.sin(2*np.pi*bass[b%4]*t));m[:,0]+=x;m[:,1]+=x
    for k in range(16):                     # arpejo
        st=s+k*beat/4
        if k%3==2: continue
        f=c[k%3]*2;e=env(st,.05,.002,.14)
        p=.5+.4*np.sin(k);x=.05*e*np.sin(2*np.pi*f*t);m[:,0]+=x*(1-p)*2;m[:,1]+=x*p*2
    for k in range(4):                      # bumbo e chimbal
        st=s+k*beat;i=(t>=st)&(t<st+.22);u=t[i]-st
        x=.33*np.exp(-u*16)*np.sin(2*np.pi*(46*u+70*(1-np.exp(-u*30))/30));m[i,0]+=x;m[i,1]+=x
rng=np.random.default_rng(7);noise=rng.standard_normal(n)
hp=noise-np.convolve(noise,np.ones(8)/8,'same')
for k in range(int(dur/(beat/2))):
    st=k*beat/2+beat/4;e=np.exp(-np.clip(t-st,0,None)*38)*(t>=st)*(t<st+.2);x=.015*e*hp;m[:,0]+=x;m[:,1]+=x
# abaixa onde há voz: o tempo das palavras vem da transcrição
w=json.load(open('palavras.json'));v=np.zeros(n)
for x in w: v[int(max(x['a']-.05,0)*sr):int(min(x['b']+.08,dur)*sr)]=1
k=int(.18*sr);v=np.convolve(v,np.ones(k)/k,'same')
g=10**((-9*np.clip(v*1.4,0,1))/20)
fim=np.clip((40.3-t)/1.2,0,1);ini=np.clip(t/.15,0,1)
m=m*(g*fim*ini)[:,None]; m=m/np.abs(m).max()*.9
with wave.open('trilha.wav','wb') as f:
    f.setnchannels(2);f.setsampwidth(2);f.setframerate(sr);f.writeframes((m*32767).astype('<i2').tobytes())
