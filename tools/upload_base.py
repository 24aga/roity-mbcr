"""Converte uma lista e mescla na base por UF no repositório privado 24aga/roity-mbcr-dados.
uso: python3 upload_base.py arquivo.xlsx
"""
import sys, json, base64, subprocess, datetime, os, importlib.util, tempfile
REPO='24aga/roity-mbcr-dados'
here=os.path.dirname(os.path.abspath(__file__))
spec=importlib.util.spec_from_file_location('k2b', os.path.join(here,'kenai2base.py'))
def gh(args, inp=None):
    r=subprocess.run(['gh','api']+args, input=inp, capture_output=True, text=True)
    return r.returncode, r.stdout, r.stderr
def get_file(path):
    code,out,err=gh([f'repos/{REPO}/contents/{path}','--jq','.sha'])
    if code!=0: return None,None
    sha=out.strip()
    code,raw,err=gh([f'repos/{REPO}/contents/{path}','-H','Accept: application/vnd.github.raw+json'])
    return sha, json.loads(raw)
def put_file(path, obj, sha, msg):
    body={'message':msg,'content':base64.b64encode(json.dumps(obj,ensure_ascii=False,separators=(',',':')).encode()).decode()}
    if sha: body['sha']=sha
    code,out,err=gh([f'repos/{REPO}/contents/{path}','-X','PUT','--input','-'], json.dumps(body))
    if code!=0: raise SystemExit('erro ao enviar '+path+': '+err[:300])

src=sys.argv[1]
k2b_src=open(os.path.join(here,'kenai2base.py')).read().split("src,base,dst=sys.argv")[0]
ns={}; exec(k2b_src, ns)
rows=ns['read_csv'](src) if src.lower().endswith(('.csv','.txt')) else ns['read_xlsx'](src)
new=ns['convert'](rows)
byuf={}
for r in new: byuf.setdefault(r[11] or 'XX',[]).append(r)
isha, index = get_file('leads/index.json')
index = index or {'v':1,'states':{}}
report={}
for uf,lst in byuf.items():
    path=f'leads/{uf}.json'
    sha,data=get_file(path)
    data=data or {'v':1,'uf':uf,'cols':['k','n','p','p2','e','c','b','cap','y','i','cnae','uf'],'rows':[]}
    seen={r[0] for r in data['rows']}; seenp={r[2] for r in data['rows'] if r[2]}
    add=0
    for r in lst:
        if r[0] in seen or (r[2] and r[2] in seenp): continue
        data['rows'].append(r); seen.add(r[0]); seenp.add(r[2]); add+=1
    data['updatedAt']=datetime.datetime.utcnow().isoformat()+'Z'
    put_file(path,data,sha,f'Base de leads {uf}: +{add}')
    cities={}
    for r in data['rows']: cities[r[5]]=cities.get(r[5],0)+1
    index['states'][uf]={'file':path,'count':len(data['rows']),'updatedAt':data['updatedAt'],'cities':dict(sorted(cities.items(),key=lambda x:-x[1]))}
    report[uf]={'novas':add,'total':len(data['rows']),'cidades':len(cities)}
index['updatedAt']=datetime.datetime.utcnow().isoformat()+'Z'
put_file('leads/index.json',index,isha,'Índice da base de leads')
print(json.dumps({'lidas':len(rows),'validas':len(new),'por_uf':report},ensure_ascii=False))
