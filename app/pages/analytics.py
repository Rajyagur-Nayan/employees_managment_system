import streamlit as st
import pandas as pd
import plotly.express as px
from datetime import date
from db.models import SessionLocal
from db.crud import get_monthly_attendance


def render():
    st.title('Monthly Analytics')
    col1, col2 = st.columns(2)
    year = col1.number_input('Year', value=date.today().year, min_value=2024)
    month = col2.number_input('Month', value=date.today().month, min_value=1, max_value=12)

    db = SessionLocal()
    records = get_monthly_attendance(db, int(year), int(month))
    db.close()

    if not records:
        st.info('No records for this month.')
        return

    df = pd.DataFrame([{
        'Date': r.date,
        'Employee ID': r.employee_id,
        'Name': r.name,
        'Time': r.timestamp.strftime('%H:%M:%S'),
        'Confidence': r.confidence,
    } for r in records])

    st.metric('Total Attendance Entries', len(df))

    daily = df.groupby('Date').size().reset_index(name='Count')
    fig = px.bar(daily, x='Date', y='Count', title='Daily Attendance Count')
    st.plotly_chart(fig, use_container_width=True)

    person = df.groupby('Name').size().reset_index(name='Days Present')
    fig2 = px.pie(person, names='Name', values='Days Present', title='Attendance by Person')
    st.plotly_chart(fig2, use_container_width=True)

    st.dataframe(df, use_container_width=True)
