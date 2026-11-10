#!/bin/zsh
S=${OUT:-/tmp/ndrs-shots}
mkdir -p $S
cd "$(dirname "$0")/.."
tag=$1; shift
(timeout 60 npx tsc --noEmit 2>&1 | grep -E "^src" | head -8)
U=${URL:-http://localhost:5180/}
F='"fps"|error|warn|pageerror|timeout'
for v in "$@"; do
case $v in
a) timeout 60 node tools/shot.mjs --url "$U" --out $S/$tag-a.png --wait 2500 --fps --eval '__dbg.begin()' | grep -E "$F";;
b) timeout 60 node tools/shot.mjs --url "$U" --out $S/$tag-b.png --wait 2500 --fps --eval '(()=>{__dbg.begin(); const h=__dbg.map.sample(-560,-140); __dbg.place(-560,h+5,-140,1.3); __dbg.freeze(true)})()' | grep -E "$F";;
e) timeout 60 node tools/shot.mjs --url "$U" --out $S/$tag-e.png --wait 1500 --eval '__dbg.view(-300,60,300, 0,60,0)' | grep -E "$F";;
v) timeout 60 node tools/shot.mjs --url "$U" --out $S/$tag-v.png --size 900x700 --wait 1200 --eval '(()=>{__dbg.begin(); const f=__dbg.flight; __dbg.freeze(true); const p=f.position; const fx=Math.sin(f.yaw), fz=Math.cos(f.yaw); __dbg.view(p.x-fx*1.6,p.y+3.0,p.z-fz*1.6,p.x,p.y,p.z)})()' | grep -E "$F";;
t) timeout 60 node tools/shot.mjs --url "$U" --out $S/$tag-t.png --wait 1500 --eval '__dbg.view(0,2600,10, 0,0,0)' | grep -E "$F";;
esac
done
echo VIEWS-DONE
