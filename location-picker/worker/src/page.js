// 与 location-picker/server.js 的 PAGE 保持一致（地图选点 UI）
export const PAGE = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>定位选点</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H" crossorigin="anonymous">
<style>
  *{box-sizing:border-box}html,body{margin:0;min-height:100%;font-family:-apple-system,BlinkMacSystemFont,sans-serif}html{min-width:320px}
  .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
  .skip-link{position:fixed;top:.5rem;left:.5rem;z-index:10001;padding:.75rem 1rem;background:#101828;color:#fff;border-radius:.5rem;transform:translateY(-150%)}.skip-link:focus{transform:none}
  .bar{padding:8px;display:flex;flex-wrap:wrap;gap:8px}
  .bar input{flex:1 1 100%;min-width:0;min-height:48px;padding:10px;font-size:16px;border:1px solid #777;border-radius:8px}
  .bar button{flex:1;min-height:48px;padding:10px 14px;font-size:16px;border:0;border-radius:8px;background:#0067d8;color:#fff}
  .bar button:disabled{opacity:.55}
  .results{margin:0 8px;border:1px solid #e2e2e2;border-radius:8px;max-height:34vh;overflow:auto;display:none}
  .results.show{display:block}
  .rrow{width:100%;min-height:48px;padding:10px 12px;font-size:14px;border:0;border-bottom:1px solid #eee;background:#fff;color:#222;display:flex;align-items:center;gap:8px;text-align:left}
  .rrow:last-child{border-bottom:0}
  .rrow:active{background:#f0f6ff}
  .rrow .fname{flex:1;min-width:0;min-height:44px;border:0;background:transparent;text-align:left}
  .rrow .fdel{min-width:44px;min-height:44px;padding:6px 10px;font-size:13px;border:0;border-radius:6px;background:#b42318;color:#fff;flex-shrink:0}
  #map{height:52vh}
  #info{margin:0;padding:8px 10px;font-size:13px;line-height:1.4}
  .opts{padding:6px 10px 12px;display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}
  .opts label{font-size:13px;color:#444;display:flex;flex-direction:column}
  .opts input{width:88px;min-height:44px;padding:8px;font-size:15px;border:1px solid #777;border-radius:6px;margin-top:2px}
  #savebtn{padding:11px 20px;font-size:16px;border:0;border-radius:8px;background:#34c759;color:#fff;font-weight:600}
  #restorebtn{padding:11px 16px;font-size:15px;border:0;border-radius:8px;background:#8e8e93;color:#fff}
  #favadd,#favlistbtn{padding:11px 14px;font-size:15px;border:0;border-radius:8px;background:#5856d6;color:#fff}
  .opts button{min-height:44px}
  .toast{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);
    background:rgba(0,0,0,.85);color:#fff;padding:10px 16px;border-radius:8px;
    font-size:14px;opacity:0;transition:opacity .3s;pointer-events:none;z-index:9999}
  .toast.show{opacity:1}
  button{cursor:pointer}button:focus-visible,input:focus-visible,#map:focus-visible{outline:3px solid #84adff;outline-offset:2px}
  @media (min-width:40rem){.bar{flex-wrap:nowrap}.bar input{flex:1 1 auto}.bar button{flex:0 0 auto}}
  @media (prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important}}
</style>
</head>
<body>
<a class="skip-link" href="#main">跳到主要内容</a>
<main id="main">
  <h1 class="sr-only">定位选点</h1>
  <form class="bar" id="searchform" role="search">
    <label class="sr-only" for="q">搜索地点</label>
    <input id="q" type="search" autocomplete="off" placeholder="搜索地点（只预览，不会立即修改定位）">
    <button id="locatebtn" type="button" disabled>当前位置</button>
    <button id="btn" type="submit">搜索</button>
  </form>
  <section class="results" id="results" aria-label="搜索结果"></section>
  <div id="map" role="region" aria-label="定位地图，可点击或使用键盘移动图钉" tabindex="0"></div>
  <p id="info" role="status" aria-live="polite">加载中…</p>
  <section class="opts" aria-label="定位参数">
    <label for="alt">海拔（米）<input id="alt" type="number" inputmode="numeric" min="-12000" max="100000"></label>
    <label for="hacc">水平精度<input id="hacc" type="number" inputmode="numeric" min="0" max="100000"></label>
    <label for="vacc">垂直精度<input id="vacc" type="number" inputmode="numeric" min="0" max="100000"></label>
    <button id="savebtn" type="button">保存定位</button>
    <button id="restorebtn" type="button">恢复真实定位</button>
    <button id="favadd" type="button">收藏此点</button>
    <button id="favlistbtn" type="button">我的收藏</button>
  </section>
  <section class="results" id="favs" aria-label="收藏地点"></section>
</main>
<div class="toast" id="toast" role="status" aria-live="polite" aria-atomic="true"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH" crossorigin="anonymous"></script>
<script>
var token = new URLSearchParams(location.search).get("token") || "";

var GCJ = (function(){
  var PI = Math.PI, a = 6378245.0, ee = 0.00669342162296594323;
  function outOfChina(lat,lng){return (lng<72.004||lng>137.8347)||(lat<0.8293||lat>55.8271);}
  function tLat(x,y){
    var r=-100.0+2.0*x+3.0*y+0.2*y*y+0.1*x*y+0.2*Math.sqrt(Math.abs(x));
    r+=(20.0*Math.sin(6.0*x*PI)+20.0*Math.sin(2.0*x*PI))*2.0/3.0;
    r+=(20.0*Math.sin(y*PI)+40.0*Math.sin(y/3.0*PI))*2.0/3.0;
    r+=(160.0*Math.sin(y/12.0*PI)+320*Math.sin(y*PI/30.0))*2.0/3.0;return r;
  }
  function tLng(x,y){
    var r=300.0+x+2.0*y+0.1*x*x+0.1*x*y+0.1*Math.sqrt(Math.abs(x));
    r+=(20.0*Math.sin(6.0*x*PI)+20.0*Math.sin(2.0*x*PI))*2.0/3.0;
    r+=(20.0*Math.sin(x*PI)+40.0*Math.sin(x/3.0*PI))*2.0/3.0;
    r+=(150.0*Math.sin(x/12.0*PI)+300*Math.sin(x/30.0*PI))*2.0/3.0;return r;
  }
  function wgs2gcj(lat,lng){
    if(outOfChina(lat,lng))return [lat,lng];
    var dLat=tLat(lng-105.0,lat-35.0), dLng=tLng(lng-105.0,lat-35.0);
    var radLat=lat/180.0*PI, m=Math.sin(radLat); m=1-ee*m*m; var sm=Math.sqrt(m);
    dLat=(dLat*180.0)/((a*(1-ee))/(m*sm)*PI);
    dLng=(dLng*180.0)/(a/sm*Math.cos(radLat)*PI);
    return [lat+dLat,lng+dLng];
  }
  function gcj2wgs(lat,lng){ // 迭代反解，往返误差 <0.001 米
    if(outOfChina(lat,lng))return [lat,lng];
    var wlat=lat, wlng=lng;
    for(var i=0;i<3;i++){ var g=wgs2gcj(wlat,wlng); wlat+=lat-g[0]; wlng+=lng-g[1]; }
    return [wlat,wlng];
  }
  return {wgs2gcj:wgs2gcj, gcj2wgs:gcj2wgs};
})();

var map, marker;
var WGS = {lat:0, lng:0};
var datum = "gcj";
var saved = true;
var enabledState = true;  // true=伪造中；false=已恢复真实定位（脚本放行）
var toastTimer;

function $(id){return document.getElementById(id);}
function toast(t){var e=$("toast");clearTimeout(toastTimer);e.textContent=t;e.classList.add("show");toastTimer=setTimeout(function(){e.classList.remove("show");},2200);}
function numOrNull(id){var v=$(id).value.trim();return v===""?null:Number(v);}
// Leaflet 在重复世界地图上可能返回 -239 这类经度，需要归一化。
function wrapLng(lng){return ((((Number(lng)+180)%360)+360)%360)-180;}

function setLocateBusy(busy){
  var b=$("locatebtn");
  b.disabled=!!busy;
  b.textContent=busy?"定位中…":"当前位置";
}

function geolocationErrorMessage(err){
  if(err&&err.code===1)return "定位权限被拒绝，请在 Safari 设置中允许定位";
  if(err&&err.code===2)return "暂时无法获取当前位置";
  if(err&&err.code===3)return "获取当前位置超时，请到开阔处重试";
  return "获取当前位置失败";
}

var FAV_KEY="lp_favs_v1";
var FAV_MAX=12;
function loadFavs(){
  try{
    var raw=localStorage.getItem(FAV_KEY);
    var a=raw?JSON.parse(raw):[];
    return Array.isArray(a)?a:[];
  }catch(e){return [];}
}
function saveFavs(list){
  try{localStorage.setItem(FAV_KEY,JSON.stringify(list.slice(0,FAV_MAX)));}catch(e){}
}
function applyFavorite(it){
  var lat=Number(it.lat), lng=wrapLng(it.lng);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)){toast("收藏坐标无效");return;}
  WGS={lat:lat,lng:lng};
  saved=false;
  if(it.alt!=null&&it.alt!=="")$("alt").value=it.alt;
  if(it.hacc!=null&&it.hacc!=="")$("hacc").value=it.hacc;
  if(it.vacc!=null&&it.vacc!=="")$("vacc").value=it.vacc;
  var p=dispPos();
  marker.setLatLng(p);
  map.setView(p,15);
  info();
  toast("已加载收藏，确认后保存");
}
function renderFavs(){
  var box=$("favs");
  var list=loadFavs();
  box.innerHTML="";
  if(!list.length){box.classList.remove("show");return;}
  list.forEach(function(it,idx){
    var row=document.createElement("div");
    row.className="rrow";
    var name=document.createElement("button");
    name.className="fname";
    name.type="button";
    name.textContent=it.name||(Number(it.lat).toFixed(4)+","+Number(it.lng).toFixed(4));
    name.addEventListener("click",function(){
      $("results").classList.remove("show");
      applyFavorite(it);
    });
    var del=document.createElement("button");
    del.className="fdel";
    del.type="button";
    del.textContent="删";
    del.addEventListener("click",function(e){
      e.stopPropagation();
      var next=loadFavs();
      next.splice(idx,1);
      saveFavs(next);
      if(next.length)renderFavs();else{box.innerHTML="";box.classList.remove("show");}
      toast("已删除收藏");
    });
    row.appendChild(name);
    row.appendChild(del);
    box.appendChild(row);
  });
  box.classList.add("show");
}
function addFavorite(){
  if(!Number.isFinite(WGS.lat)||!Number.isFinite(WGS.lng)){toast("当前坐标无效");return;}
  var def=$("q").value.trim()||(WGS.lat.toFixed(4)+","+WGS.lng.toFixed(4));
  var name=window.prompt("收藏名称",def);
  if(name===null)return;
  name=String(name).trim()||def;
  var list=loadFavs().filter(function(it){
    return Math.abs(Number(it.lat)-WGS.lat)>1e-5||Math.abs(Number(it.lng)-WGS.lng)>1e-5;
  });
  list.unshift({
    name:name,
    lat:WGS.lat,
    lng:WGS.lng,
    alt:numOrNull("alt"),
    hacc:numOrNull("hacc"),
    vacc:numOrNull("vacc"),
    ts:Date.now()
  });
  saveFavs(list);
  renderFavs();
  toast("已收藏");
}
function toggleFavs(){
  var box=$("favs");
  if(box.classList.contains("show")){box.classList.remove("show");return;}
  $("results").classList.remove("show");
  if(!loadFavs().length){toast("暂无收藏");return;}
  renderFavs();
}

function info(){
  if(!enabledState){
    $("info").innerHTML = "<b style='color:#ff9500'>已恢复真实定位 · 脚本放行不修改</b>　（关开定位后生效）";
    return;
  }
  var tag = saved ? "已保存 ✓" : "未保存 · 点“保存定位”生效";
  $("info").innerHTML = "<b style='color:"+(saved?"#34c759":"#ff9500")+"'>"+tag+"</b>　WGS-84 "+
    WGS.lat.toFixed(5)+", "+WGS.lng.toFixed(5)+"　海拔 "+($("alt").value||"?")+"m";
}

// 切换按钮外观：伪造中(灰按钮“恢复真实定位”) / 已恢复(橙按钮“重新开启伪造”)
function updateEnabledUI(){
  var b=$("restorebtn");
  if(enabledState){ b.textContent="恢复真实定位"; b.style.background="#8e8e93"; }
  else { b.textContent="● 重新开启伪造"; b.style.background="#ff9500"; }
  info();
}

// 一键切换 伪造/恢复真实
function toggleEnabled(){
  var want = !enabledState;
  fetch("/enable?token="+encodeURIComponent(token),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({enabled:want})})
    .then(function(r){
      if(r.ok){ enabledState=want; updateEnabledUI();
        toast(want ? "已开启伪造，记得关开定位生效" : "已恢复真实定位，记得关开定位生效"); }
      else toast("切换失败 "+r.status);
    })
    .catch(function(){ toast("网络错误"); });
}

function dispPos(){return datum==="gcj"?GCJ.wgs2gcj(WGS.lat,WGS.lng):[WGS.lat,WGS.lng];}
function toWgs(lat,lng){lng=wrapLng(lng);return datum==="gcj"?GCJ.gcj2wgs(lat,lng):[lat,lng];}

function fetchElevation(lat,lng){
  lng=wrapLng(lng);
  return fetch("https://api.open-meteo.com/v1/elevation?latitude="+lat+"&longitude="+lng)
    .then(function(r){return r.json();})
    .then(function(d){return (d&&d.elevation&&d.elevation.length)?d.elevation[0]:null;})
    .catch(function(){return null;});
}

function movePin(dispLat,dispLng){
  dispLng=wrapLng(dispLng);
  var w=toWgs(dispLat,dispLng);
  WGS={lat:w[0], lng:wrapLng(w[1])};
  saved=false;
  marker.setLatLng([dispLat,dispLng]);
  info();
  fetchElevation(WGS.lat,WGS.lng).then(function(el){ if(el!==null)$("alt").value=Math.round(el); info(); });
}

function commit(){
  if(!$("alt").checkValidity()||!$("hacc").checkValidity()||!$("vacc").checkValidity()){
    toast("请输入有效范围内的海拔和精度");
    return;
  }
  var payload={lat:WGS.lat, lng:WGS.lng,
    altitude:numOrNull("alt"), horizontalAccuracy:numOrNull("hacc"), verticalAccuracy:numOrNull("vacc")};
  fetch("/set?token="+encodeURIComponent(token),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)})
    .then(function(r){ if(r.ok){ saved=true; enabledState=true; updateEnabledUI(); toast("已保存 ✓ Loon/小火箭约60秒内生效"); } else { toast("保存失败 "+r.status); } })
    .catch(function(){ toast("网络错误"); });
}

function locateCurrent(){
  if(enabledState){
    toast("请先恢复真实定位并刷新定位服务");
    return;
  }
  if(!navigator.geolocation){
    toast("当前浏览器不支持定位");
    return;
  }

  setLocateBusy(true);
  navigator.geolocation.getCurrentPosition(
    function(pos){
      var lat=Number(pos&&pos.coords&&pos.coords.latitude);
      var lng=wrapLng(pos&&pos.coords&&pos.coords.longitude);
      if(!Number.isFinite(lat)||!Number.isFinite(lng)){
        toast("获取当前位置失败");
        setLocateBusy(false);
        return;
      }

      WGS={lat:lat,lng:lng};
      saved=false;
      var p=dispPos();
      marker.setLatLng(p);
      map.setView(p,16);
      info();
      fetchElevation(WGS.lat,WGS.lng).then(function(el){
        if(el!==null)$("alt").value=Math.round(el);
        info();
      });
      toast("已定位到当前位置，请确认后保存");
      setLocateBusy(false);
    },
    function(err){
      toast(geolocationErrorMessage(err));
      setLocateBusy(false);
    },
    {enableHighAccuracy:true,maximumAge:0,timeout:12000}
  );
}

function search(){
  var q=$("q").value.trim(); if(!q) return;
  fetch("https://nominatim.openstreetmap.org/search?format=json&addressdetails=0&limit=8&q="+encodeURIComponent(q))
    .then(function(r){return r.json();})
    .then(function(a){
      var box=$("results"); box.innerHTML="";
      if(!a||!a.length){ box.classList.remove("show"); toast("没找到"); return; }
      a.forEach(function(it){
        var row=document.createElement("button");
        row.className="rrow";
        row.type="button";
        row.textContent=it.display_name;
        row.addEventListener("click",function(){
          box.classList.remove("show"); box.innerHTML="";
          var la=+it.lat, lo=+it.lon;
          var p = datum==="gcj"?GCJ.wgs2gcj(la,lo):[la,lo];
          map.setView(p,15);
          toast("已定位视野，在地图上点一下放置图钉");
        });
        box.appendChild(row);
      });
      box.classList.add("show");
    })
    .catch(function(){toast("搜索失败");});
}

function load(){
  fetch("/loc.json?token="+encodeURIComponent(token)).then(function(r){return r.json();}).then(function(d){
    WGS={lat:d.latitude, lng:d.longitude};
    saved=true;
    enabledState=(d.enabled!==false);
    $("alt").value=(d.altitude!==undefined?d.altitude:"");
    $("hacc").value=(d.horizontalAccuracy!==undefined?d.horizontalAccuracy:39);
    $("vacc").value=(d.verticalAccuracy!==undefined?d.verticalAccuracy:1000);

    var amapVec=L.tileLayer("https://wprd0{s}.is.autonavi.com/appmaptile?x={x}&y={y}&z={z}&lang=zh_cn&size=1&scl=1&style=7",{subdomains:"1234",maxZoom:18,attribution:"高德地图"});
    amapVec.datum="gcj";
    var amapSat=L.layerGroup([
      L.tileLayer("https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}",{subdomains:"1234",maxZoom:18}),
      L.tileLayer("https://wprd0{s}.is.autonavi.com/appmaptile?x={x}&y={y}&z={z}&lang=zh_cn&size=1&scl=1&style=8",{subdomains:"1234",maxZoom:18})
    ]);
    amapSat.datum="gcj";
    var osm=L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,referrerPolicy:"strict-origin-when-cross-origin",attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'});
    osm.datum="wgs";

    map=L.map("map");
    amapVec.addTo(map); datum="gcj";
    map.setView(dispPos(),13);
    L.control.layers({"高德地图":amapVec,"高德卫星":amapSat,"国外 OSM":osm},null,{collapsed:false}).addTo(map);

    marker=L.marker(dispPos(),{draggable:true}).addTo(map);
    updateEnabledUI();
    setLocateBusy(false);

    map.on("baselayerchange",function(e){datum=e.layer.datum||"wgs"; var p=dispPos(); marker.setLatLng(p); map.setView(p,map.getZoom()); info();});
    map.on("click",function(e){movePin(e.latlng.lat,e.latlng.lng);});
    marker.on("dragend",function(){var p=marker.getLatLng(); movePin(p.lat,p.lng);});
  }).catch(function(){$("info").textContent="加载失败，检查 token 是否正确";});
}

$("searchform").addEventListener("submit",function(e){e.preventDefault();search();});
$("locatebtn").addEventListener("click",locateCurrent);
$("savebtn").addEventListener("click",commit);
$("restorebtn").addEventListener("click",toggleEnabled);
$("favadd").addEventListener("click",addFavorite);
$("favlistbtn").addEventListener("click",toggleFavs);
load();
</script>
</body>
</html>`;
