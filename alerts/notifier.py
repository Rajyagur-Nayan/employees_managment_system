import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

load_dotenv(override=True)

IST = timezone(timedelta(hours=5, minutes=30))


def send_email_alert(person, record):
    ef = os.environ.get('ALERT_EMAIL_FROM')
    ep = os.environ.get('ALERT_EMAIL_PASSWORD')
    recipient = getattr(person, 'email', None) or os.environ.get('ALERT_EMAIL_TO', ef)

    if not recipient:
        print('[Email] No recipient found — skipping.')
        return

    try:
        msg = MIMEMultipart()
        msg['From']    = ef
        msg['To']      = recipient
        msg['Subject'] = f'Attendance Logged - {person.name}'
        body = f'''
Smart Attendance System — Check-in Alert
=========================================
Employee  : {person.name}
ID        : {person.employee_id}
Department: {getattr(person, 'department', 'N/A')}
Time      : {record.timestamp.astimezone(IST).strftime('%H:%M:%S IST')}
Date      : {record.date}
Confidence: {record.confidence:.0%}
=========================================
This is an automated message. Do not reply.
        '''
        msg.attach(MIMEText(body, 'plain'))
        with smtplib.SMTP('smtp.gmail.com', 587) as server:
            server.starttls()
            server.login(ef, ep)
            server.sendmail(ef, recipient, msg.as_string())
        print(f'[Email] Sent to {person.name} <{recipient}>')
    except Exception as e:
        print(f'[Email] Failed for {person.name}: {e}')


def send_absence_alert(person, date: str):
    ef = os.environ.get('ALERT_EMAIL_FROM')
    ep = os.environ.get('ALERT_EMAIL_PASSWORD')
    recipient = getattr(person, 'email', None) or os.environ.get('ALERT_EMAIL_TO', ef)

    if not recipient:
        return

    try:
        msg = MIMEMultipart()
        msg['From']    = ef
        msg['To']      = recipient
        msg['Subject'] = f'Absence Alert - {person.name} - {date}'
        body = f'''
Smart Attendance System — Absence Alert
=========================================
Employee  : {person.name}
ID        : {person.employee_id}
Department: {getattr(person, 'department', 'N/A')}
Date      : {date}
Status    : NOT marked present
=========================================
Please contact your administrator if this is incorrect.
        '''
        msg.attach(MIMEText(body, 'plain'))
        with smtplib.SMTP('smtp.gmail.com', 587) as server:
            server.starttls()
            server.login(ef, ep)
            server.sendmail(ef, recipient, msg.as_string())
        print(f'[Email] Absence alert sent to {person.name} <{recipient}>')
    except Exception as e:
        print(f'[Email] Absence alert failed for {person.name}: {e}')


def send_alert(person, record):
    send_email_alert(person, record)