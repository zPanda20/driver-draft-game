import subprocess, time, os, json
from playwright.sync_api import sync_playwright
PORT=3333
env=dict(os.environ, PORT=str(PORT), TEST_SPEED='4', REAL_RACE='1', DATA_DIR='/tmp/ddg-vis')
subprocess.run(['rm','-rf','/tmp/ddg-vis'])
srv=subprocess.Popen(['node','server/index.js'],env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
time.sleep(1.5)
out='/tmp/claude-0/-home-claude/e6a215a7-dccf-553d-9c19-55a85c0553ef/scratchpad/shots'
errors=[]
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':1280,'height':860}); host=ctx.new_page()
    host.on('pageerror',lambda e: errors.append(str(e)))
    host.on('console',lambda m: errors.append(m.text) if m.type=='error' and '404' not in m.text else None)
    host.goto(f'http://localhost:{PORT}/'); host.fill('#nm','Luke'); host.click('[data-act=create]'); host.wait_for_selector('.code')
    code=host.inner_text('.code')
    sc=b.new_context(viewport={'width':1600,'height':900}).new_page(); sc.goto(f'http://localhost:{PORT}/screen?room={code}')
    host.click('[data-slug=castrol]'); host.click('[data-act=start]')
    def step(): return host.evaluate("window.__st.S && window.__st.S.step")
    def rnd(): return host.evaluate("window.__st.S && window.__st.S.race ? window.__st.S.race.round : -1")
    seen={}; t_start=time.time()
    def snap(name,delay):
        key=name
        if key in seen: return
        seen[key]=1; time.sleep(delay); host.screenshot(path=f'{out}/v_{name}.png')
    # run until race 2 finishes (index 1)
    shots_done=set()
    entered={}
    while time.time()-t_start<400:
        s=step()
        if s=='draft.pick':
            if not host.query_selector('.locked-note') and host.query_selector('[data-act=setPick]'):
                try:
                    host.click('[data-act=setPick][data-slot=pri] >> nth=0',timeout=1500); host.click('[data-act=lock]',timeout=1500)
                except Exception: pass
        r=rnd()
        if s and s.startswith('race.') and r==1:
            t=entered.setdefault(s,time.time()); el=time.time()-t
            for nm,when in {'race.pre':[('a_pre',1.0)],'race.half':[('b_half_early',3),('c_half_mid',7),('d_half_end',13)],'race.mid':[('e_mid',1)],'race.finish':[('f_fin_early',3),('g_fin_mid',7),('h_fin_end',17)]}.get(s,[]):
                if el>=when and nm not in shots_done:
                    host.screenshot(path=f'{out}/v_{nm}.png'); shots_done.add(nm)
                    if nm=='h_fin_end': sc.screenshot(path=f'{out}/v_screen_end.png')
            if s.startswith('race.') and host.query_selector('.popup:not(.done) [data-act=popupYes]'): host.click('.popup:not(.done) [data-act=popupYes]')
        if len(shots_done)>=9: break
        time.sleep(0.3)
    print(sorted(shots_done), errors[:5])
    b.close()
srv.terminate()
