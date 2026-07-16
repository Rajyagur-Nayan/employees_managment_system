import streamlit as st
from datetime import date
from db.crud import get_person_count
from db.models import Person


def render(db):   # ✅ receive db from main.py
    st.title('Person View')

    # Fetch all employees
    persons = db.query(Person).all()

    if not persons:
        st.info('No employees found.')
        return

    # Dropdown
    person_map = {
        f"{p.employee_id} - {p.name}": p.employee_id
        for p in persons
    }

    selected = st.selectbox('Select Employee', list(person_map.keys()))
    emp_id = person_map[selected]

    # Date range
    col1, col2 = st.columns(2)
    start = col1.date_input('From', value=date.today())
    end = col2.date_input('To', value=date.today())

    # Count attendance
    count = get_person_count(
        db,
        emp_id,
        start.strftime('%Y-%m-%d'),
        end.strftime('%Y-%m-%d')
    )

    st.metric('Days Present', count)