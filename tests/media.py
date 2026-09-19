from acceptance import *
def main():
 admin=Client();admin.ok('/api/auth/login','POST',{'login':'AdminQA','password':PASS})
 fake=b'\x1a\x45\xdf\xa3webm V_VP9'+b'\0'*114
 start=admin.ok('/api/uploads/start','POST',{'name':'fake.webm','size':len(fake),'media_type':'video'});admin.ok('/api/uploads/'+start['id']+'/part?number=1','PUT',fake);admin.code('/api/uploads/'+start['id']+'/complete','POST',{},'INVALID_VIDEO_TYPE')
 for extension in ['webm','mp4','mov']:
  file=ROOT/'tests/.data'/('sample.webm' if extension=='webm' else 'sample.mp4')
  media=admin.upload('sample.'+extension,file.read_bytes(),'video');check('实际 '+extension+' 容器上传验证',admin.call('/api/media/'+media['id'])[0]==200)
 Path(ROOT/'tests/.data/media-result.json').write_text(json.dumps({'passed':len(results),'checks':results},ensure_ascii=False,indent=2));print('MEDIA PASSED:',len(results),flush=True)
if __name__=='__main__':main()
