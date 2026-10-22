# Drive real browser pages against the real server: host + 2 players + big screen. Takes screenshots.
import subprocess, time, os, sys, json
from playwright.sync_api import sync_playwright
PORT=3222
env=dict(os.environ, PORT=str(PORT), TEST_SPEED='6', DATA_DIR='/tmp/ddg-br')
subprocess.run(['rm','-rf','/tmp/ddg-br'])
srv=subprocess.Popen(['node','server/index.js'],env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
time.sleep(1.5)
out='/tmp/claude-0/-home-claude/e6a215a7-dccf-553d-9c19-55a85c0553ef/scratchpad/shots'
os.makedirs(out,exist_ok=True)
errors=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome' if os.path.exists('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') else None)
    def page(name,w=1280,h=860):
        ctx=b.new_context(viewport={'width':w,'height':h}); pg=ctx.new_page()
        pg.on('console',lambda m: errors.append((name,m.text)) if m.type=='error' and '404' not in m.text else None)
        pg.on('pageerror',lambda e: errors.append((name,'PAGEERROR '+str(e))))
        return pg
    host=page('host'); host.goto(f'http://localhost:{PORT}/')
    host.fill('#nm','Luke'); host.click('[data-act=create]')
    host.wait_for_selector('.code'); code=host.inner_text('.code'); print('room',code)
    p1=page('p1'); p1.goto(f'http://localhost:{PORT}/'); p1.fill('#nm','Sandra'); p1.fill('#jc',code); p1.click('[data-act=join]')
    p2=page('p2',390,800); p2.goto(f'http://localhost:{PORT}/'); p2.fill('#nm','Phone'); p2.fill('#jc',code); p2.click('[data-act=join]')
    host.wait_for_selector('.liv'); host.click('[data-slug=castrol]'); p1.wait_for_selector('.liv'); p1.click('[data-slug=mclaren-papaya]')
    time.sleep(0.5); host.screenshot(path=out+'/01_lobby.png'); p2.screenshot(path=out+'/01_lobby_phone.png')
    screen=page('screen'); screen.goto(f'http://localhost:{PORT}/screen?room={code}')
    host.select_option('[data-set=pace]','0.7') if False else None
    host.click('[data-act=start]')
    host.wait_for_selector('text=Make your pick'); time.sleep(0.6)
    host.screenshot(path=out+'/02_draft.png'); screen.screenshot(path=out+'/02_screen_draft.png'); p2.screenshot(path=out+'/02_phone_draft.png')
    def draft_pick(pg):
        try:
            if pg.query_selector('.locked-note') or not pg.query_selector('[data-act=setPick]'): return
            pg.click('[data-act=setPick][data-slot=pri] >> nth=0',timeout=1500); pg.wait_for_selector('[data-act=lock]:not([disabled])',timeout=1500); pg.click('[data-act=lock]',timeout=1500)
        except Exception as e: pass
    t1=time.time(); n=0
    while not host.query_selector('#raceRoot') and time.time()-t1<150:
        for pg in (host,p1,p2): draft_pick(pg)
        n+=1
        if n==40: host.screenshot(path=out+'/03_reveal.png')
        time.sleep(0.3)
    print('in race', round(time.time()-t1))
    t0=time.time(); shots=set()
    while time.time()-t0<120:
        for pg in (host,p1,p2):
            if pg.query_selector('.popup:not(.done) [data-act=popupYes]'):
                pg.click('.popup:not(.done) [data-act=popupYes]')
        step=host.evaluate("document.querySelector('.top .phase')?.textContent")
        for tag in ('race 1/18','race 3/18'):
            if tag in (step or '') and (tag+'a') not in shots:
                time.sleep(0.5); host.screenshot(path=out+f'/04_race_{tag[5]}.png'); shots.add(tag+'a'); screen.screenshot(path=out+f'/04_screen_{tag[5]}.png')
        if 'race 4/18' in (step or ''): break
        time.sleep(0.4)
    print('errors',json.dumps(errors[:10],indent=1))
    b.close()
srv.terminate()
