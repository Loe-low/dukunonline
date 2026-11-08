const H=["Jumat","Sabtu","Minggu","Senin","Selasa","Rabu","Kamis"];
const P=["Legi","Pahing","Pon","Wage","Kliwon"];
const NH={Minggu:5,Senin:4,Selasa:3,Rabu:7,Kamis:8,Jumat:6,Sabtu:9};
const NP={Legi:5,Pahing:9,Pon:7,Wage:4,Kliwon:8};
const mod=(a,n)=>((a%n)+n)%n;
const DAY=86400000;
export function validDate(y,m,d){const t=new Date(Date.UTC(y,m-1,d));return t.getUTCFullYear()===y&&t.getUTCMonth()===m-1&&t.getUTCDate()===d;}
export function weton(y,m,d){
  const n=Math.round((Date.UTC(y,m-1,d)-Date.UTC(1945,7,17))/DAY);
  const hari=H[mod(n,7)],pasaran=P[mod(n,5)];
  return {hari,pasaran,neptu:NH[hari]+NP[pasaran]};
}
const IMLEK={1990:[1,27],1991:[2,15],1992:[2,4],1993:[1,23],1994:[2,10],1995:[1,31],1996:[2,19],1997:[2,7],1998:[1,28],1999:[2,16],2000:[2,5],2001:[1,24],2002:[2,12],2003:[2,1],2004:[1,22],2005:[2,9],2006:[1,29],2007:[2,18],2008:[2,7],2009:[1,26],2010:[2,14],2011:[2,3],2012:[1,23],2013:[2,10],2014:[1,31],2015:[2,19],2016:[2,8],2017:[1,28],2018:[2,16],2019:[2,5],2020:[1,25],2021:[2,12],2022:[2,1],2023:[1,22],2024:[2,10],2025:[1,29],2026:[2,17],2027:[2,6],2028:[1,26],2029:[2,13],2030:[2,3]};
const SHIO=["Tikus","Kerbau","Macan","Kelinci","Naga","Ular","Kuda","Kambing","Monyet","Ayam","Anjing","Babi"];
const EL=["Logam","Logam","Air","Air","Kayu","Kayu","Api","Api","Tanah","Tanah"];
export function shio(y,m,d){
  const im=IMLEK[y]; if(!im) return null; // di luar tabel 1990-2030
  const diff=Math.round((Date.UTC(y,m-1,d)-Date.UTC(y,im[0]-1,im[1]))/DAY);
  const sy=diff<0?y-1:y;
  return {tahunShio:sy,hewan:SHIO[mod(sy-1996,12)],elemen:EL[mod(sy,10)],dekatImlek:Math.abs(diff)<=2};
}
const Z=[[1,20,"Aquarius","Udara"],[2,19,"Pisces","Air"],[3,21,"Aries","Api"],[4,20,"Taurus","Tanah"],[5,21,"Gemini","Udara"],[6,21,"Cancer","Air"],[7,23,"Leo","Api"],[8,23,"Virgo","Tanah"],[9,23,"Libra","Udara"],[10,23,"Scorpio","Air"],[11,22,"Sagitarius","Api"],[12,22,"Capricorn","Tanah"]];
export function zodiak(m,d){
  const key=m*100+d; let i=-1;
  for(let k=0;k<Z.length;k++) if(Z[k][0]*100+Z[k][1]<=key) i=k;
  const s=i<0?Z[11]:Z[i];
  const t=Date.UTC(2000,m-1,d), st=(a)=>Date.UTC(2000,a[0]-1,a[1]);
  const next=Z[(Z.indexOf(s)+1)%12];
  const nextT=next[0]===1?Date.UTC(m===1?2000:2001,0,20):st(next);
  const dekatBatas=Math.abs(t-st(s))<=DAY||Math.abs(nextT-t)<=DAY;
  return {tanda:s[2],elemen:s[3],dekatBatas};
}
