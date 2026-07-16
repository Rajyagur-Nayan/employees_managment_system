import streamlit as st
import pandas as pd
from datetime import date
from db.models import SessionLocal
from db.crud import get_daily_attendance


def render():
    st.title('Daily Attendance')
    selected_date = st.date_input('Select date', value=date.today())

    db = SessionLocal()
    records = get_daily_attendance(db, selected_date.strftime('%Y-%m-%d'))

    if not records:
        st.info('No attendance records for this date.')
    else:
        df = pd.DataFrame([{
            'Employee ID': r.employee_id,
            'Name': r.name,
            'Time': r.timestamp.strftime('%H:%M:%S'),
            'Confidence': f'{r.confidence:.0%}',
        } for r in records])

        col1, col2 = st.columns(2)
        col1.metric('Total Present', len(df))
        col2.metric('Date', selected_date.strftime('%d %b %Y'))
        st.dataframe(df, use_container_width=True)

    st.divider()

    db.close()
    