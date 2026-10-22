# Off-season screens: play fast through a season, then screenshot season end, parts re-draft, free agency, lock-in.
import subprocess, time, os
from playwright.sync_api import sync_playwright
PORT=3444
env=dict(os.environ, PORT=str(PORT), TEST_SPEED='25', DATA_DIR='/tmp/ddg-vis2')
subprocess.run(['rm','-rf','/tmp/ddg-vis2'])
srv=subprocess.Popen(['node','server/index.js'],env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
time.sleep(1.5)
out='/tmp/claude-0/-home-claude/e6a215a7-dccf-553d-9c19-55a85c0553ef/scratchpad/shots'
errors=[]
with sync_playwright() as p:
    b=p.chromium.launch()
    host=b.new_context(viewport={'width':1280,'height':860}).new_page()
    host.on('pageerror',lambda e: errors.append(str(e)))
    host.on('console',lambda m: errors.append(m.text) if m.type=='error' and '404' not in m.text else None)
    host.goto(f'http://localhost:{PORT}/'); host.fill('#nm','Luke'); host.click('[data-act=create]'); host.wait_for_selector('.code')
    host.click('[data-slug=castrol]'); host.click('[data-act=start]')
    step=lambda: host.evaluate("window.__st.S && window.__st.S.step")
    done=set(); t0=time.time(); pop_shot=False
    def clickq(sel,timeout=800):
        try: host.click(sel,timeout=timeout); return True
        except Exception: return False
    while time.time()-t0<300 and len(done)<6:
        s=step()
        if s=='draft.pick' and not host.query_selector('.locked-note') and host.query_selector('[data-act=setPick]'):
            clickq('[data-act=setPick][data-slot=pri] >> nth=0'); clickq('[data-act=lock]')
        if host.query_selector('.popup:not(.done) [data-act=popupYes]'):
            if not pop_shot: host.screenshot(path=out+'/w_popup.png'); pop_shot=True
            clickq('.popup:not(.done) [data-act=popupYes]')
        if s=='season.end' and 'end' not in done:
            time.sleep(0.5); host.screenshot(path=out+'/w_season_end.png'); done.add('end'); clickq('[data-act=cont]')
        if s=='parts.turn' and 'parts' not in done:
            time.sleep(0.4); host.screenshot(path=out+'/w_parts.png'); done.add('parts')
        if s=='parts.turn':
            clickq('[data-act=partTake] >> nth=0',400)
        if s=='fa.turn':
            if 'fa' not in done:
                time.sleep(0.4); host.screenshot(path=out+'/w_fa.png'); done.add('fa')
            clickq('[data-act=faSel] >> nth=0',400); clickq('[data-act=tab][data-tab=principals]',400); clickq('[data-act=faSel] >> nth=0',400); clickq('[data-act=faClaim]',400)
        if s=='lock' and 'lock' not in done and host.query_selector('[data-act=keepOk]'):
            time.sleep(0.3); host.screenshot(path=out+'/w_lock.png'); done.add('lock'); clickq('[data-act=keepOk]')
        if s=='offseason.done' and 'lineups' not in done:
            time.sleep(0.4); host.screenshot(path=out+'/w_lineups.png'); done.add('lineups')
        time.sleep(0.25)
    print(sorted(done), errors[:5])
    b.close()
srv.terminate()
