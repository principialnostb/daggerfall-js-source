"""Pixel artwork for eight woodland materials. Rows start at the roots in Blender UV space."""
import math
from random import Random

PAGES = [
    # shadow, weathered ridge, inner leaves, sun-facing tips
    ((57,43,35),(148,102,73),(29,53,42),(103,125,79)),   # pine
    ((51,51,44),(140,136,110),(38,58,34),(131,146,64)),  # small leaves
    ((55,42,32),(154,119,82),(72,52,33),(167,131,88)),   # old wood and end grain
    ((49,46,43),(160,153,137),(68,60,52),(151,136,110)),# silver snag
    ((62,48,32),(148,113,67),(33,62,38),(112,143,66)),   # buttressed fig
    ((66,50,31),(166,137,87),(35,64,40),(130,155,74)),  # date palm
    ((58,47,34),(137,109,75),(42,68,45),(121,142,76)),  # fan palm
    ((56,46,36),(142,117,83),(63,62,33),(174,132,54)),  # autumn crown
]

def paint():
    width, height = 128*len(PAGES), 512
    ink = bytearray(width*height)
    colors, winter = [], []
    for page,(b0,b1,l0,l1) in enumerate(PAGES):
        rng = Random(9201+page)
        for layer,(low,high) in enumerate(((b0,b1),(l0,l1))):
            for tone in range(8):
                col = [round(a+(b-a)*tone/7) for a,b in zip(low,high)]
                colors.append(col)
                snow = (.10,.14,.18,.26,.38,.53,.69,.79)[tone] if layer and page not in (2,3) else 0
                winter.append([round(c+(s-c)*snow) for c,s in zip(col,(211,222,221))])
        def put(x,y,tone,leaf=False):
            ink[y*width+page*128+x%128] = page*16+8*leaf+max(0,min(7,int(tone)))
        # Bark grain travels up each branch. Scales peel across it on pines,
        # whereas the palms keep the transverse scars of old leaf bases.
        knots = [(rng.randrange(128),rng.randrange(32,360)) for _ in range(8)]
        for y in range(384):
            for x in range(128):
                p = x*math.tau/128
                grain = x+2.8*math.sin(.029*y+3*p)+1.6*math.sin(.076*y+2*p)
                for kx,ky in knots:
                    if abs(y-ky)<22:
                        dx = (x-kx+64)%128-64
                        grain += dx*math.exp(-((dx/6)**2+((y-ky)/14)**2))
                ridge = (grain*(12 if page in (0,2,4) else 18)/128)%1
                tone = 1 if ridge<.12 else 3 if ridge<.23 else 6 if ridge<.41 else 4
                tone += int(math.sin(4*p+.045*y)+.6*math.cos(7*p-.024*y))
                if page in (5,6):
                    scar = (y/(15 if page==5 else 11)+.22*math.cos(5*p)+.17*math.sin(2*p+.04*y))%1
                    tone = (1 if scar<.10 else 6 if scar<.27 else 4) + (tone-3)*.42
                elif page==0:
                    plate=(y/19+.38*math.sin(8*p)+.18*math.cos(3*p+y*.035))%1
                    tone += -2 if plate<.1 else int(plate<.2)
                elif page==3:
                    tone = 2+tone*.70 - (2 if ridge<.18 and math.cos(.061*y+p)>-.4 else 0)
                put(x,y,tone)
        for kx,ky in knots:
            for dy in range(-11,12):
                for dx in range(-4,5):
                    r=(dx/4)**2+(dy/11)**2
                    if r<1: put(kx+dx,ky+dy,1 if r<.17 or .55<r<.86 else 5)
        tile = bytearray([255]*16384)
        def dab(x,y,tone):
            tile[(round(y)%128)*128+round(x)%128] = max(0,min(7,int(tone)))
        def line(x,y,dx,dy,tone):
            steps=max(1,math.ceil(max(abs(dx),abs(dy))))
            for k in range(steps+1): dab(x+dx*k/steps,y+dy*k/steps,tone)
        if page in (2,3):
            for y in range(128):
                for x in range(128):
                    r=math.hypot((x-64)*1.06,y-63)
                    a=math.atan2(y-63,x-64)
                    ring=(r+.9*math.sin(4*a)+1.6*math.sin(2*a+r*.08))%6
                    tone = 2 if ring<1.2 else 5 if ring<2.1 else 4
                    if r>17 and abs(math.sin(2.5*a+.03*math.sin(.2*r)))<.027: tone=0
                    dab(x,y,tone)
        elif page in (0,5,6):
            # Fine paired needles or lance-shaped palm pinnae grow from a continuous rib.
            for band in range(5):
                for row in range(5):
                    x,y=band*26+rng.randrange(-3,4),row*27+rng.randrange(-4,4)
                    tilt=rng.uniform(-.21,.21); length=rng.randrange(24,36)
                    line(x,y,tilt*length,length,3)
                    for j in range(1,length,2 if page==0 else 3):
                        for sign in (-1,1):
                            spread=(.6+math.sin(j/length*math.pi))*(5 if page==0 else 7)
                            dx,dy=sign*spread, rng.uniform(3,9)
                            shade=rng.randrange(3,7)-(sign<0)
                            line(x+tilt*j,y+j,dx,dy,shade)
                            if page!=0: line(x+tilt*j,y+j+1,dx*.84,dy,shade-1)
        else:
            for n in range(250 if page==1 else 170):
                x,y = rng.randrange(128),rng.randrange(128)
                angle=rng.uniform(-1.3,1.3)+(n%2)*math.pi
                ux,uy=math.sin(angle),math.cos(angle)
                length=rng.randrange(6,12) if page==1 else rng.randrange(11,22)
                shade=rng.randrange(2,7)
                for j in range(length):
                    half=math.sin(math.pi*(j+.3)/length)**.78 * (length*.26)
                    for k in range(-int(half),int(half)+1):
                        dab(x+j*ux+k*uy,y+j*uy-k*ux,shade-(k<0)+(k==0 and j<length*.72))
        for y in range(128):
            for x in range(128):
                v=tile[y*128+x]
                if v==255 and page in (5,6):
                    # Each pinna already has a folded geometric outline; use continuous waxy tissue inside it.
                    v=2+int(math.sin(x*.24+y*.11)>.24)+int((x+2*y)%21<3)
                if v==255:
                    if math.sin(x*math.tau/32+.8*math.cos(y*math.tau/32))+math.cos((y-x*.5)*math.tau/32)>.86:
                        ink[(384+y)*width+page*128+x]=255
                        continue
                    v=1
                put(x,384+y,v,True)
    return ink,colors,winter
