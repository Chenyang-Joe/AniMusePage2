import json,struct,sys,os
def info(p):
    with open(p,'rb') as f:
        magic,ver,length=struct.unpack('<III',f.read(12))
        clen,ctype=struct.unpack('<II',f.read(8))
        j=json.loads(f.read(clen).decode('utf-8'))
    n=lambda k: len(j.get(k,[]))
    prims=0; morphs=0; named=[]
    for m in j.get('meshes',[]):
        for pr in m.get('primitives',[]):
            prims+=1
            if 'targets' in pr: morphs=max(morphs,len(pr['targets']))
    anims=[]
    for a in j.get('animations',[]):
        # duration
        anims.append((a.get('name','?'),len(a.get('channels',[])),len(a.get('samplers',[]))))
    skins=n('skins')
    # frame count from first sampler input accessor
    fc=None
    if j.get('animations'):
        s=j['animations'][0]['samplers'][0]['input']
        acc=j['accessors'][s]; fc=acc['count']; mx=acc.get('max'); 
        dur=mx[0] if mx else None
    else: dur=None
    print(f"{os.path.basename(os.path.dirname(p))}/{os.path.basename(p)}")
    print(f"  size={os.path.getsize(p)/1e6:.2f}MB nodes={n('nodes')} meshes={n('meshes')} prims={prims} skins={skins} morphTargets={morphs} anims={len(j.get('animations',[]))} keyframes={fc} dur={dur}")
    if j.get('animations'):
        paths=set()
        for a in j['animations']:
            for c in a['channels']: paths.add(c['target']['path'])
        print(f"  anim channels target paths: {sorted(paths)}  nChannels={len(j['animations'][0]['channels'])}")
    # total vertices
    tv=0
    for m in j.get('meshes',[]):
        for pr in m.get('primitives',[]):
            tv+=j['accessors'][pr['attributes']['POSITION']]['count']
    print(f"  totalVerts={tv}  materials={n('materials')} images={n('images')}")
for p in sys.argv[1:]: 
    try: info(p)
    except Exception as e: print(p,'ERR',e)
