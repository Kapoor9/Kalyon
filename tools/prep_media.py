"""Prepare the Passenger tab's photographs: crop watermarks, enlarge with EDSR super-resolution
(OpenCV dnn_superres, tiled), and compute a depth map with Depth Anything V2 (ONNX) for 2.5D parallax.

Models are not in the repository. Download them into tools/models/:
  EDSR_x4.pb, EDSR_x2.pb   https://github.com/Saafke/EDSR_Tensorflow/tree/master/models
  da2_vits.onnx            https://github.com/fabio-sim/Depth-Anything-ONNX/releases (depth_anything_v2_vits.onnx)
Source photos go in tools/media_src/ (P1.png ... D6.png). Run:  python tools/prep_media.py
"""
import sys, time, numpy as np, cv2, onnxruntime as ort
from PIL import Image, ImageFilter, ImageEnhance
import os
HERE=os.path.dirname(os.path.abspath(__file__)); SRC=f'{HERE}/media_src'; OUT=f'{HERE}/../docs/img/pass'; MOD=f'{HERE}/models'
sr4=cv2.dnn_superres.DnnSuperResImpl_create(); sr4.readModel(f'{MOD}/EDSR_x4.pb'); sr4.setModel('edsr',4)
sr2=cv2.dnn_superres.DnnSuperResImpl_create(); sr2.readModel(f'{MOD}/EDSR_x2.pb'); sr2.setModel('edsr',2)
def upscale(a, sr, f, tile=220, pad=12):
    # tiled, so memory stays small; overlapping borders are cropped away
    H, W = a.shape[:2]
    out = np.zeros((H*f, W*f, 3), np.uint8)
    for y in range(0, H, tile):
        for x in range(0, W, tile):
            y0, x0 = max(0, y-pad), max(0, x-pad)
            y1, x1 = min(H, y+tile+pad), min(W, x+tile+pad)
            u = sr.upsample(np.ascontiguousarray(a[y0:y1, x0:x1]))
            ty1, tx1 = min(H, y+tile), min(W, x+tile)
            out[y*f:ty1*f, x*f:tx1*f] = u[(y-y0)*f:(y-y0+ty1-y)*f, (x-x0)*f:(x-x0+tx1-x)*f]
    return out
sess=ort.InferenceSession(f'{MOD}/da2_vits.onnx')
# name: (source, crop box as fractions l,t,r,b)
JOBS = {
 'hero-sunset':('P1',(0,0,1,1)), 'fog-headlights':('P2',(0,0,1,1)), 'rain-platform':('P3',(0,0,1,1)),
 'festival-crowd':('P4',(0,0,1,1)), 'window-day':('P5',(0,0,1,1)), 'loco':('P6',(0.012,0.012,0.988,0.955)),
 'tracks-aerial':('P7',(0,0,1,1)), 'platform-night':('P8',(0,0,1,1)),
 'city-dehradun':('D1',(0,0,1,1)), 'city-haridwar':('D2',(0,0,1,1)), 'city-moradabad':('D3',(0,0,1,1)),
 'city-bareilly':('D4',(0,0,1,0.86)), 'city-lucknow':('D5',(0,0,1,1)), 'city-newdelhi':('D6',(0,0,1,1)),
}
only = sys.argv[1:]
for name,(src,box) in JOBS.items():
    if only and name not in only: continue
    t0=time.time()
    im=Image.open(f'{SRC}/{src}.png').convert('RGB')
    W,H=im.size
    im=im.crop((int(box[0]*W),int(box[1]*H),int(box[2]*W),int(box[3]*H)))
    w,h=im.size
    if w < 1600 or h < 1200:
        a=cv2.cvtColor(np.array(im),cv2.COLOR_RGB2BGR)
        a=upscale(a, sr4, 4) if w < 900 else upscale(a, sr2, 2)
        im=Image.fromarray(cv2.cvtColor(a,cv2.COLOR_BGR2RGB))
    lim = 2560 if im.width >= im.height else 1800
    if im.width>lim: im=im.resize((lim,round(im.height*lim/im.width)),Image.LANCZOS)
    im=im.filter(ImageFilter.UnsharpMask(radius=1.4,percent=40,threshold=2))
    im.save(f'{OUT}/{name}.jpg',quality=84,optimize=True,progressive=True)
    # depth
    x=np.array(im.resize((518,518),Image.BICUBIC)).astype(np.float32)/255.
    x=(x-np.array([0.485,0.456,0.406]))/np.array([0.229,0.224,0.225])
    d=sess.run(None,{'l_x_':x.transpose(2,0,1)[None].astype(np.float32)})[0][0]
    d=(d-d.min())/(d.max()-d.min()+1e-6)
    dw=1024; dh=round(im.height*dw/im.width)
    dimg=Image.fromarray((d*255).astype(np.uint8)).resize((dw,dh),Image.BICUBIC)
    # grow foreground edges a little so parallax does not tear around near objects, then soften
    dimg=dimg.filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.GaussianBlur(3))
    dimg.save(f'{OUT}/{name}-depth.jpg',quality=90)
    print(name, im.size, f'{time.time()-t0:.0f}s', flush=True)
