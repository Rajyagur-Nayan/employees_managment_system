import sys
import os

# Ensure the project root (parent of this app/ folder) is always on sys.path.
# Needed because `streamlit run app/main.py` only adds app/ to sys.path by
# default, but this project imports sibling packages (db, core, alerts) as
# if the project root were the import root.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import streamlit as st
from db.models import SessionLocal   # ✅ import added

st.set_page_config(page_title='Smart Attendance', layout='wide')

page = st.sidebar.selectbox(
    'Navigation',
    ['Live Camera', 'Daily Attendance', 'Monthly Analytics', 'Person View']
)

if page == 'Live Camera':
    from app.pages import live
    live.render()

elif page == 'Daily Attendance':
    from app.pages import dashboard
    dashboard.render()

elif page == 'Monthly Analytics':
    from app.pages import analytics
    analytics.render()

elif page == 'Person View':
    from app.pages import person_view

    db = SessionLocal()          # ✅ create session here
    person_view.render(db)       # ✅ pass db
    db.close()                  # ✅ close session