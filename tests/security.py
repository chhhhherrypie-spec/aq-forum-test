from acceptance import *
def main():
 admin=Client();admin.ok('/api/auth/login','POST',{'login':'AdminQA','password':PASS})
 u=Client();id=u.register('Secure'+RUN);admin.ok('/api/admin/users/'+id,'PATCH',{'action':'points','points':100})
 db=sqlite3.connect(next(p for p in (ROOT/'.wrangler/state/v3/d1').rglob('*.sqlite') if p.name!='metadata.sqlite'))
 p=u.post('并发评论测试'+RUN)
 with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:r=list(ex.map(lambda i:u.call('/api/posts/'+p['id']+'/comments','POST',{'content':'这是一个用于并发验收的超过二十个有效字符的评论'+str(i)}),range(10)))
 check('并发评论总奖励不超过6',sum(x[1]['awarded'] for x in r)==6 and all(x[0]==201 for x in r))
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:r=list(ex.map(lambda i:u.post('并发水帖'+RUN+str(i),'chat'),range(8)))
 check('并发水帖仅2篇获奖励',sum(x['awarded']>0 for x in r)==2)
 q=Client();q.ok('/api/quiz/start','POST',{});q.ok('/api/quiz','POST',{'answers':{'default':'1452'}})
 quiz_cookie=next(c.value for c in q.jar if c.name=='forum_quiz')
 import hashlib
 db.execute('UPDATE quiz_attempts SET expires_at=? WHERE id=?',('2000-01-01T00:00:00.000Z',hashlib.sha256(quiz_cookie.encode()).hexdigest()));db.commit()
 q.code('/api/auth/register','POST',{'username':'Expired'+RUN,'email':'expired'+RUN+'@example.invalid','password':PASS,'confirmPassword':PASS},'QUIZ_NOT_PASSED')
 duplicate=Client();duplicate.ok('/api/quiz/start','POST',{});duplicate.ok('/api/quiz','POST',{'answers':{'default':'1452'}})
 duplicate.code('/api/auth/register','POST',{'username':('Secure'+RUN).lower(),'email':'unique'+RUN+'@example.invalid','password':PASS,'confirmPassword':PASS},'USERNAME_EXISTS')
 duplicate.code('/api/auth/register','POST',{'username':'Other'+RUN,'email':('Secure'+RUN+'@example.invalid').upper(),'password':PASS,'confirmPassword':PASS},'EMAIL_EXISTS')
 wrong=Client();wrong.code('/api/auth/login','POST',{'login':'Secure'+RUN,'password':'badpassword1'},'WRONG_PASSWORD');wrong.code('/api/auth/login','POST',{'login':'NoSuchUser'+RUN,'password':PASS},'USER_NOT_FOUND')
 config=admin.ok('/api/me')['settings']
 future=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(days=1)).isoformat()
 admin.ok('/api/admin/users/'+id,'PATCH',{'action':'ban','reason':'未来封禁','start_at':future,'end_at':None});check('未来封禁不提前生效',not u.me()['ban'] and u.ok('/api/users/'+id)['account_status']=='active')
 admin.ok('/api/admin/users/'+id,'PATCH',{'action':'ban','reason':'模式B封禁','end_at':None});admin.ok('/api/admin/settings','PUT',{**config,'ban_login_mode':'deny'});wrong.code('/api/auth/login','POST',{'login':'Secure'+RUN,'password':PASS},'ACCOUNT_BANNED')
 admin.ok('/api/admin/users/'+id,'PATCH',{'action':'unban'});admin.ok('/api/admin/settings','PUT',config)
 qapi=admin.ok('/api/admin/quiz');admin.ok('/api/admin/quiz','PUT',{'questions':qapi['questions']+[{'id':str(uuid.uuid4()),'question':'第二个测试题目','correct_answer':'test','type':'text','score':10,'status':'active'}]});admin.ok('/api/admin/settings','PUT',{**config,'quiz_draw_count':2,'quiz_pass_score':20});qq=Client();qs=qq.ok('/api/quiz/start','POST',{});check('后台新增题目和抽题数量生效',len(qs['questions'])==2)
 qq.code('/api/quiz','POST',{'answers':{'default':'1452'}},'INCOMPLETE_QUIZ');answers={x['id']:'1452' if x['id']=='default' else 'test' for x in qs['questions']};qq.code('/api/quiz','POST',{'answers':answers},'PASS')
 admin.ok('/api/admin/settings','PUT',config);admin.ok('/api/admin/quiz','PUT',qapi)
 from PIL import Image
 blobs={}
 for fmt,name in [('JPEG','jpg'),('PNG','png'),('GIF','gif'),('WEBP','webp')]:
  f=io.BytesIO();Image.new('RGB',(80,60),(120,80,210)).save(f,format=fmt);blobs[name]=f.getvalue();m=u.upload('format.'+name,f.getvalue());check('实际图片格式 '+fmt+' 上传通过',u.call('/api/media/'+m['id'])[0]==200)
 # Multipart upload above one 8 MiB chunk, with real PNG bytes.
 import random
 pixels=random.Random(83).randbytes(1800*1800*3);f=io.BytesIO();Image.frombytes('RGB',(1800,1800),pixels).save(f,format='PNG');large=f.getvalue();assert len(large)>8*1024*1024
 m=u.upload('multipart.png',large);status,data=u.call('/api/media/'+m['id']);check('跨分段大图持久化字节完全一致',status==200 and data==large)
 media=u.upload('caption.png',blobs['png']);post=u.post('图片区简介与说明','image',[{'block_type':'text','content':'这是图片简介'},{'block_type':'image','media_id':media['id'],'content':'图片说明文字','is_locked':False}]);detail=u.ok('/api/posts/'+post['id']);check('图片区奖励10且图片说明持久化',post['awarded']==10 and detail['blocks'][1]['content']=='图片说明文字')
 low=Client();lowid=low.register('Lower'+RUN)
 low.code('/api/posts','POST',{'title':'偷取图片','category':'image','blocks':[{'block_type':'image','media_id':m['id']}]},'POST_PERMISSION_DENIED')
 admin.ok('/api/admin/users/'+lowid,'PATCH',{'action':'points','points':10})
 low.code('/api/posts','POST',{'title':'偷取图片','category':'image','blocks':[{'block_type':'text','content':'简介'},{'block_type':'image','media_id':m['id']}]},'UPLOAD_FAILED')
 check('跨站写请求拒绝',u.call('/api/checkin','POST',{},headers={'Origin':'https://attacker.invalid'})[0]==403)
 check('普通用户后台题目答案拒绝',low.call('/api/admin/quiz')[0]==403)
 # Stable last page excludes first-page records.
 for route,key in [('users','users'),('posts','posts'),('comments','comments'),('logs','logs')]:
  first=admin.ok('/api/admin/'+route+'?offset=0')[key];second=admin.ok('/api/admin/'+route+'?offset=50')[key]
  check('后台 '+route+' 分页无交集',not(set(x['id'] for x in first)&set(x['id'] for x in second)))
 Path(ROOT/'tests/.data/security-result.json').write_text(json.dumps({'passed':len(results),'checks':results},ensure_ascii=False,indent=2));print('SECURITY PASSED:',len(results),flush=True)
if __name__=='__main__':main()
