"""Indexed pixel artwork for the field oak and Norway spruce proof materials."""
import math
from random import Random

COLORS = [
    (48,42,35),(61,51,41),(73,61,48),(87,72,54),(100,84,64),(114,98,77),(128,113,89),
    (48,41,35),(62,52,43),(76,64,53),(91,77,63),(104,89,73),(119,103,86),(135,118,99),
    (34,49,31),(45,62,34),(55,73,38),(68,87,41),(79,99,47),(92,111,53),(105,120,64),
    (29,45,39),(36,55,44),(44,65,49),(53,76,54),(64,87,60),(77,101,69),(94,115,79),
]


def artwork():
    pixels = bytearray(256*512)
    rng = Random(817)
    for species in range(2):
        off = 128*species
        knots = [(22,79,4,13),(94,185,5,14),(58,286,3,9)]
        ridges = 15 if species else 11
        for y in range(384):
            for x in range(128):
                phase = x*math.tau/128
                u = x + 2.3*math.sin(.031*y+2*phase)+1.6*math.sin(.065*y+3*phase)
                knot_value = None
                for kx,ky,w,h in knots:
                    dx,dy=x-kx,y-ky
                    r=(dx/w)**2+(dy/h)**2
                    if r<10:
                        u-=dx*math.exp(-r*.37)
                        if r<1.3: knot_value=1 if r<.18 or .55<r<.95 else 4
                q=(u*ridges/128+.16*math.sin(.047*y+phase))%1
                ridge = 0 if q<.09 else 2 if q<.22 else 5 if q<.37 else 4 if q<.62 else 3
                ridge+=int(math.sin(2*phase+.017*y)+.65*math.cos(5*phase-.036*y))
                if species:
                    plate=(y/14+.55*math.cos(phase*11)+.19*math.sin(.12*x+.04*y))%1
                    if plate<.10: ridge-=2
                    elif plate<.20: ridge+=1
                elif .69<q<.78 and math.sin(y*.081+phase*9)>.25: ridge-=2
                if y<18 and math.sin(phase*5)>.16: ridge-=1
                pixels[y*256+x+off] = 7*species+max(0,min(6,knot_value if knot_value is not None else ridge))
        # Broken lips of overlapping bark scales. Each one tapers into the bole at both ends.
        # Draw the two edges separately so they catch and lose light at different heights.
        for n in range(320 if species else 260):
            sx, sy = rng.randrange(128), rng.randrange(-30,384)
            length = rng.randrange(6,21) if species else rng.randrange(12,42)
            width = rng.uniform(1.4,4.2) if species else rng.uniform(1,3)
            lean = rng.uniform(-3,3)
            for step in range(length):
                y = sy + step
                if not 0 <= y < 384:
                    continue
                t = step / length
                swell = math.sin(math.pi*t)
                middle = sx + lean*t + .8*math.sin(t*4 + sx)
                left = round(middle - width*swell) % 128
                right = round(middle + width*swell) % 128
                ix = y*256 + off + left
                tone = pixels[ix] - 7*species
                pixels[ix] = 7*species + max(0,tone-(2 if .18<t<.70 else 1))
                if .12 < t < .66:
                    ix = y*256 + off + right
                    pixels[ix] = 7*species + min(6,pixels[ix]-7*species+1)
        # Overlapping oak leaflets and comb-like needle fans, painted in tileable patches.
        tile=bytearray([255]*128*128)
        def dot(x,y,v):
            tile[(round(y)%128)*128+round(x)%128]=max(0,min(6,v))
        def stroke(x,y,dx,dy,v):
            steps=max(1,math.ceil(max(abs(dx),abs(dy))))
            for n in range(steps+1): dot(x+dx*n/steps,y+dy*n/steps,v)
        for n in range(230 if not species else 126):
            x,y=rng.randrange(128),rng.randrange(128)
            a=rng.uniform(-1,1)+(math.pi if n%2 else 0)
            ux,uy=math.sin(a),math.cos(a)
            length=rng.randrange(9,19); shade=rng.randrange(2,6)
            if species:
                stroke(x,y,length*ux,length*uy,2)
                for j in range(1,length,2):
                    for sign in (-1,1):
                        width=(1-j/length)*4+2
                        needle = shade - (sign == 1)
                        dx, dy = ux*4+sign*uy*width, uy*4-sign*ux*width
                        stroke(x+j*ux,y+j*uy,dx,dy,needle)
                        if shade >= 4 and j > length*.44 and sign < 0:
                            dot(x+j*ux+dx,y+j*uy+dy,needle+1)
            else:
                for j in range(length):
                    w=math.sin(math.pi*(j+.3)/length)**.8*(3.3+.9*math.cos(j*1.15))
                    for k in range(-int(w),int(w)+1):
                        dot(x+j*ux+k*uy,y+j*uy-k*ux,shade-(k<0)+(k==0 and j<length*.76))
        for i, value in enumerate(tile):
            if value == 255:
                x, y = i % 128, i // 128
                # Keep breaks between sprays in patches large enough to survive the first mip.
                gap = math.sin(x*math.tau/32 + math.sin(y*math.tau/32)) + math.cos(y*math.tau/16 - x*math.tau/64)
                if gap < (.12 if species else .50):
                    tile[i] = 1
        for y in range(128):
            pixels[(384+y)*256+off:(384+y)*256+off+128]=bytes(255 if c==255 else 14+7*species+c for c in tile[y*128:y*128+128])
    return pixels
