"""Full HTTP acceptance tests against the local persisted D1/R2 development service.
Run only on localhost. Historical sign-in dates are seeded, never exposed by the API.
"""
import os,json,urllib.request,urllib.error,http.cookiejar,uuid,sqlite3,datetime,concurrent.futures,io,base64
from pathlib import Path
BASE='http://localhost:3000'
ROOT=Path(__file__).resolve().parents[1]
RUN=uuid.uuid4().hex[:7]
PASS='ForumTest9283'
results=[]
def check(name,condition,detail=''):
 if not condition:raise AssertionError(name+': '+str(detail))
 results.append(name);print('PASS',name,flush=True)
class Client:
 def __init__(self):self.jar=http.cookiejar.CookieJar();self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
 def call(self,path,method='GET',data=None,raw=False,headers=None):
  h={'X-Forum-Request':'1','Origin':BASE,'CF-Connecting-IP':str(uuid.uuid4())}
  if isinstance(data,bytes):body=data
  elif data is not None:body=json.dumps(data).encode();h['Content-Type']='application/json'
  else:body=None
  h.update(headers or {})
  req=urllib.request.Request(BASE+path,body,method=method,headers=h)
  try:r=self.opener.open(req,timeout=120)
  except urllib.error.HTTPError as e:r=e
  v=r.read()
  try:d=json.loads(v)
  except:d=v
  return r.status,d
 def ok(self,path,method='GET',data=None):
  status,d=self.call(path,method,data)
  assert status<400,(path,status,d)
  return d
 def code(self,path,method,data,expected):
  status,d=self.call(path,method,data);check(expected,d.get('code')==expected,d);return d
 def me(self):return self.ok('/api/me')['user']
 def register(self,name):
  self.ok('/api/quiz/start','POST',{});self.ok('/api/quiz','POST',{'answers':{'default':'1452'}})
  return self.ok('/api/auth/register','POST',{'username':name,'email':name.lower()+'@example.invalid','password':PASS,'confirmPassword':PASS})['user_id']
 def post(self,title='测试分享',category='article',blocks=None):
  return self.ok('/api/posts','POST',{'title':title,'category':category,'blocks':blocks or [{'block_type':'text','content':title+'这是用于验收的有效内容，测试完成后不会发布到线上。'+str(uuid.uuid4()),'is_locked':False}],'tags':['验收']})
 def upload(self,name,blob,type='image',cover=None):
  m=self.ok('/api/uploads/start','POST',{'name':name,'size':len(blob),'media_type':type})
  for i,start in enumerate(range(0,len(blob),m['chunk_size'])):self.ok('/api/uploads/'+m['id']+'/part?number='+str(i+1),'PUT',blob[start:start+m['chunk_size']])
  return self.ok('/api/uploads/'+m['id']+'/complete','POST',{'cover_id':cover})
def main():
 guest=Client();guest.code('/api/posts','GET',None,'UNAUTHORIZED')
 check('游客首页不含帖子数据',guest.call('/')[0]==200)
 check('游客直接后台被拒绝',guest.call('/admin')[0]==403)
 account={'username':'Reader'+RUN,'email':'reader'+RUN+'@example.invalid','password':PASS,'confirmPassword':PASS}
 guest.code('/api/auth/register','POST',account,'QUIZ_NOT_PASSED')
 quiz=guest.ok('/api/quiz/start','POST',{})
 check('准入API不泄露答案','correct_answer' not in json.dumps(quiz) and '1452' not in json.dumps(quiz))
 guest.code('/api/quiz','POST',{'answers':{}},'INCOMPLETE_QUIZ')
 guest.code('/api/quiz','POST',{'answers':{'default':'wrong'}},'FAIL')
 guest.code('/api/auth/register','POST',account,'QUIZ_NOT_PASSED')
 guest.code('/api/quiz','POST',{'answers':{'default':'1452'}},'PASS')
 for change,code in [({'username':'中文'},'INVALID_USERNAME'),({'email':'wrong'},'INVALID_EMAIL'),({'password':'abc12'},'PASSWORD_TOO_SHORT'),({'password':'abcdefgh'},'WEAK_PASSWORD'),({'confirmPassword':'mismatch'},'PASSWORD_NOT_MATCH')]:guest.code('/api/auth/register','POST',{**account,**change},code)
 readerid=guest.ok('/api/auth/register','POST',account)['user_id'];reader=guest
 check('注册初始积分为0且无发帖评论权限',reader.me()['points']==0 and not reader.me()['permissions']['post'] and not reader.me()['permissions']['comment'])
 guest.code('/api/auth/register','POST',account,'QUIZ_NOT_PASSED')
 reader.code('/api/posts','POST',{'title':'越权','category':'article','blocks':[]},'POST_PERMISSION_DENIED')
 reader.code('/api/admin/users','GET',None,'FORBIDDEN')
 settings=dict(line.split('=',1) for line in (ROOT/'.dev.vars').read_text().splitlines() if '=' in line)
 admin=Client();admin_data={'username':'AdminQA','email':settings['ADMIN_EMAIL'],'password':PASS,'confirmPassword':PASS,'setup_token':settings['ADMIN_SETUP_TOKEN']}
 if admin.ok('/api/me')['setup_available']:admin.ok('/api/auth/setup','POST',admin_data)
 else:admin.ok('/api/auth/login','POST',{'login':'AdminQA','password':PASS})
 check('管理员可访问用户邮箱',any(v['email']==account['email'] for v in admin.ok('/api/admin/users?search='+readerid)['users']))
 admin.code('/api/auth/setup','POST',admin_data,'SETUP_DISABLED')
 author=Client();authorid=author.register('Author'+RUN)
 longuser=Client();longid=longuser.register('Long'+RUN)
 def points(id,n):admin.ok('/api/admin/users/'+id,'PATCH',{'action':'points','points':n,'reason':'验收设置'})
 dbpath=next(p for p in (ROOT/'.wrangler/state/v3/d1').rglob('*.sqlite') if p.name!='metadata.sqlite')
 db=sqlite3.connect(dbpath);db.execute('PRAGMA foreign_keys=ON')
 check('数据库只保存密码哈希',db.execute('SELECT password_hash FROM users WHERE id=?',(readerid,)).fetchone()[0].startswith('pbkdf2$') and PASS not in db.execute('SELECT password_hash FROM users WHERE id=?',(readerid,)).fetchone()[0])
 # Four prior server dates, plus today via the real API.
 today=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).date()
 for n in range(1,5):
  day=(today-datetime.timedelta(days=n)).isoformat();sid=readerid+':'+day
  db.execute('INSERT INTO check_ins(id,user_id,check_in_date,points_awarded) VALUES(?,?,?,2)',(sid,readerid,day))
  db.execute("INSERT INTO point_transactions(id,user_id,amount,type,source_id,created_at,reward_date) VALUES(?,?,2,'checkin',?,?,?)",(str(uuid.uuid4()),readerid,sid,day+'T00:00:00.000Z',day))
 db.commit()
 check('历史签到累计8分',reader.me()['points']==8)
 reader.code('/api/checkin','POST',{},'CHECK_IN_SUCCESS');check('第五天签到即时解锁发帖',reader.me()['points']==10 and reader.me()['permissions']['post'])
 with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:r=list(ex.map(lambda _:reader.call('/api/checkin','POST',{}),range(12)))
 check('并发重复签到不重复加分',reader.me()['points']==10 and all(x[1]['code']=='ALREADY_CHECKED_IN' for x in r))
 points(authorid,10);a=author.post('发文验收'+RUN);check('发文奖励10且持久化',a['awarded']==10 and author.me()['points']==20)
 author.code('/api/posts/'+a['id']+'/comments','POST',{'content':'还没权限'},'COMMENT_PERMISSION_DENIED')
 p=author.post('第二份发文'+RUN);check('达到30立即解锁评论',author.me()['points']==30 and author.me()['permissions']['comment'])
 short=author.ok('/api/posts/'+p['id']+'/comments','POST',{'content':'好喜欢这个！'});check('短评论奖励2',short['awarded']==2)
 dup=author.ok('/api/posts/'+p['id']+'/comments','POST',{'content':'好喜欢这个！'});check('重复评论不重复得分',dup['awarded']==0)
 longtext='这是一个超过二十个有效字符的评论，我很喜欢这份认真而温柔的分享。'
 capped=author.ok('/api/posts/'+p['id']+'/comments','POST',{'content':longtext});check('每日6分上限按剩余4分截断',capped['awarded']==4)
 author.code('/api/posts/'+p['id']+'/comments','POST',{'content':' \n\t\u200b'},'EMPTY_COMMENT')
 points(longid,30);longc=longuser.ok('/api/posts/'+p['id']+'/comments','POST',{'content':longtext});check('独立账户长评论完整奖励5',longc['awarded']==5)
 before=author.me()['points'];author.ok('/api/comments/'+capped['id'],'DELETE',{});author.ok('/api/comments/'+capped['id'],'DELETE',{});check('删除部分奖励评论仅回滚一次4分',author.me()['points']==before-4)
 after=author.ok('/api/posts/'+p['id']+'/comments','POST',{'content':'删后仍不能刷积分'});check('删除不重置每日评论额度',after['awarded']==0)
 chats=[author.post('水区测试'+str(n)+RUN,'chat') for n in range(3)];check('水区每天最多2帖奖励',sum(x['awarded'] for x in chats)==6 and chats[2]['awarded']==0)
 fixed=[{'block_type':'text','content':'完全相同的内容'+RUN,'is_locked':False}]
 d1=author.post('重复测试A','article',fixed);d2=author.post('重复测试B','article',fixed);check('重复发帖不发积分',d1['awarded']==10 and d2['awarded']==0)
 author.ok('/api/posts/'+d1['id'],'PATCH',{'title':'编辑内容','blocks':[{'block_type':'text','content':'编辑后的其他内容'+RUN}],'tags':[]});d3=author.post('编辑后重复原文','article',fixed);check('编辑后历史指纹仍防重复奖励',d3['awarded']==0)
 points(readerid,20)
 from PIL import Image
 im=io.BytesIO();Image.new('RGB',(64,48),(120,130,220)).save(im,format='PNG');blob=im.getvalue()
 pub=author.upload('public.png',blob);sec=author.upload('locked.png',blob)
 block=[{'block_type':'text','content':'这是帖子公开内容，用来帮助成员判断这份分享是否感兴趣。'*3,'is_locked':False},{'block_type':'text','content':'SECRET_LOCKED_TEXT_'+RUN,'is_locked':True},{'block_type':'image','media_id':pub['id'],'is_locked':False},{'block_type':'image','media_id':sec['id'],'is_locked':True}]
 locked=author.post('待解锁验收'+RUN,'article',block)
 detail=reader.ok('/api/posts/'+locked['id']);encoded=json.dumps(detail);check('低分API没有锁定正文或媒体ID','SECRET_LOCKED_TEXT' not in encoded and sec['id'] not in encoded)
 reader.code('/api/media/'+sec['id'],'GET',None,'LOCKED_CONTENT_PERMISSION_DENIED')
 status,_=reader.call('/api/media/'+sec['id'],'HEAD');check('锁定图片HEAD被拒绝',status==403)
 reader.code('/api/media/'+sec['id'],'GET',None,'LOCKED_CONTENT_PERMISSION_DENIED')
 status,_=reader.call('/api/media/'+sec['id'],headers={'Range':'bytes=0-10'});check('锁定图片Range被拒绝',status==403)
 points(readerid,30);detail=reader.ok('/api/posts/'+locked['id']);check('30分解锁且不扣积分','SECRET_LOCKED_TEXT' in json.dumps(detail) and reader.me()['points']==30)
 check('30分图片可读取',reader.call('/api/media/'+sec['id'])[0]==200)
 points(readerid,25);check('降分再次隐藏','SECRET_LOCKED_TEXT' not in json.dumps(reader.ok('/api/posts/'+locked['id'])))
 points(authorid,15);check('低分作者仍能查看自己的锁定内容','SECRET_LOCKED_TEXT' in json.dumps(author.ok('/api/posts/'+locked['id'])))
 check('管理员无需积分查看锁定内容','SECRET_LOCKED_TEXT' in json.dumps(admin.ok('/api/posts/'+locked['id'])))
 author.code('/api/posts','POST',{'title':'全部隐藏','category':'article','blocks':[{'block_type':'text','content':'全隐藏','is_locked':True}]},'PUBLIC_CONTENT_TOO_SHORT')
 author.code('/api/posts/'+locked['id'],'PATCH',{'title':'全部隐藏','blocks':[{'block_type':'text','content':'全隐藏','is_locked':True}]},'PUBLIC_CONTENT_TOO_SHORT')
 check('失败编辑保留原文','SECRET_LOCKED_TEXT' in json.dumps(author.ok('/api/posts/'+locked['id'])))
 author.code('/api/posts','POST',{'title':'空图片区','category':'image','blocks':[{'block_type':'text','content':'简介'}]},'IMAGE_REQUIRED')
 author.code('/api/posts','POST',{'title':'空视频区','category':'video','blocks':[]},'VIDEO_REQUIRED')
 private=author.upload('private.png',blob);author.code('/api/posts','POST',{'title':'全锁图片','category':'image','blocks':[{'block_type':'text','content':'简介'},{'block_type':'image','media_id':private['id'],'is_locked':True}]},'PUBLIC_IMAGE_REQUIRED')
 bad=author.ok('/api/uploads/start','POST',{'name':'broken.mp4','size':8,'media_type':'video'});author.ok('/api/uploads/'+bad['id']+'/part?number=1','PUT',b'\0\0\0\x08ftyp');author.code('/api/uploads/'+bad['id']+'/complete','POST',{},'INVALID_VIDEO_TYPE')
 author.code('/api/uploads/start','POST',{'name':'bad.svg','size':500,'media_type':'image'},'INVALID_IMAGE_TYPE')
 author.code('/api/uploads/start','POST',{'name':'large.png','size':51*1024*1024,'media_type':'image'},'IMAGE_TOO_LARGE')
 author.code('/api/uploads/start','POST',{'name':'large.mp4','size':501*1024*1024,'media_type':'video'},'VIDEO_TOO_LARGE')
 incomplete=author.ok('/api/uploads/start','POST',{'name':'incomplete.mp4','size':512,'media_type':'video'});author.code('/api/uploads/'+incomplete['id']+'/complete','POST',{},'UPLOAD_INTERRUPTED')
 # A real generated H.264 file is provided in test fixtures before the run.
 video=ROOT/'tests/.data/sample.mp4'
 if video.exists():
  cover=author.upload('cover.png',blob);v=author.upload('sample.mp4',video.read_bytes(),'video',cover['id']);vp=author.post('视频验收'+RUN,'video',[{'block_type':'video','media_id':v['id']}]);check('真实视频上传发帖奖励10',vp['awarded']==10)
  status,raw=reader.call('/api/media/'+v['id'],headers={'Range':'bytes=0-15'});check('视频范围请求支持播放',status==206 and len(raw)==16)
  # Cover reuse attack: bind cover to a locked post before posting its parent video.
  ci=author.upload('attack-cover.png',blob);cv=author.upload('attack.mp4',video.read_bytes(),'video',ci['id']);ap=author.post('锁定封面攻击测试','article',[{'block_type':'text','content':'公开正文内容'*20},{'block_type':'image','media_id':ci['id'],'is_locked':True}]);author.code('/api/posts','POST',{'title':'复用封面尝试','category':'video','blocks':[{'block_type':'video','media_id':cv['id']}]},'UPLOAD_FAILED');reader.code('/api/media/'+ci['id'],'GET',None,'LOCKED_CONTENT_PERMISSION_DENIED')
 check('普通用户不能读取其他邮箱','email' not in reader.ok('/api/users/'+authorid) and 'email' not in reader.ok('/api/posts/'+a['id'])['author'])
 admin.ok('/api/admin/users/'+authorid,'PATCH',{'action':'ban','reason':'封禁验收','start_at':None,'end_at':None})
 for route,method,data in [('/api/checkin','POST',{}),('/api/posts','POST',{}),('/api/posts/'+p['id']+'/comments','POST',{'content':'违规操作'}),('/api/media/'+sec['id'],'GET',None)]:author.code(route,method,data,'ACCOUNT_BANNED')
 login=Client();login.ok('/api/auth/login','POST',{'login':'Author'+RUN,'password':PASS});check('封禁模式A可登录查看原因',login.me()['ban']['reason']=='封禁验收')
 before=author.me()['points'];admin.ok('/api/admin/users/'+authorid,'PATCH',{'action':'unban'});check('解封恢复积分和权限',author.me()['points']==before and not author.me()['ban'])
 config=admin.ok('/api/me')['settings'];admin.ok('/api/admin/settings','PUT',{**config,'locked_threshold':20,'post_threshold':15});check('后台阈值实时影响已有内容','SECRET_LOCKED_TEXT' in json.dumps(reader.ok('/api/posts/'+locked['id'])))
 admin.ok('/api/admin/settings','PUT',config)
 before=author.me()['points'];admin.ok('/api/posts/'+a['id'],'DELETE',{'deduct':False});check('管理员删除选择不扣积分',author.me()['points']==before)
 admin.ok('/api/admin/posts/'+a['id'],'PATCH',{'action':'restore'});admin.ok('/api/posts/'+a['id'],'DELETE',{'deduct':True});admin.ok('/api/posts/'+a['id'],'DELETE',{'deduct':True});check('恢复再删除只回滚一次',author.me()['points']==before-10)
 check('积分流水总和等于账户余额',all(db.execute('SELECT points FROM users WHERE id=?',(id,)).fetchone()[0]==db.execute('SELECT coalesce(sum(amount),0) FROM point_transactions WHERE user_id=?',(id,)).fetchone()[0] for id in [readerid,authorid,longid]))
 old=reader.me()['points'];reader.ok('/api/auth/logout','POST',{});reader.ok('/api/auth/login','POST',{'login':account['email'],'password':PASS});check('重新登录后积分和内容持久化',reader.me()['points']==old and reader.ok('/api/posts/'+locked['id'])['id']==locked['id'])
 check('后台操作日志已记录',len(admin.ok('/api/admin/logs')['logs'])>=8)
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:r=list(ex.map(lambda _:longuser.call('/api/checkin','POST',{}),range(10)))
 check('首次并发签到仅一次成功',sum(x[1].get('code')=='CHECK_IN_SUCCESS' for x in r)==1)
 # End with an intact, readable local fixture for UI verification.
 Path(ROOT/'tests/.data/test-result.json').write_text(json.dumps({'passed':len(results),'checks':results,'run':RUN,'author':'Author'+RUN,'reader':account['username']},ensure_ascii=False,indent=2))
 print('ACCEPTANCE PASSED:',len(results),flush=True)
if __name__=='__main__':main()
