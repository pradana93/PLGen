import streamlit as st
import requests
import pandas as pd
import datetime
import io
import json
import csv
import time
import threading
import plotly.graph_objects as go

# ==========================================
# CONFIGURATION & AUTHENTICATION
# ==========================================
BASE_URL = "https://jestu93.pythonanywhere.com"
ADMIN_PASS = "majesta93"

# ==========================================
# NEW: PREMIUM VERSIONING & CHANGELOG
# ==========================================
APP_VERSION = "1.0.7α"
CHANGELOGS = {
    "1.0.7α": {
        "date": "26 Jun 2026",
        "summary": "TSA Tracker Improvements & Goods in Custody",
        "items": [
            "✅ Fixed: New Case form no longer auto-creates tickets",
            "✅ Improved: Dynamic item entry with data_editor",
            "✅ Added: Goods in Custody tab for leftover items",
            "✅ Added: Custody status workflow (OPEN → ASSIGNED → CLEARED)"
        ]
    },
    "1.0.6α": {
        "date": "25 Jun 2026",
        "summary": "Staff Performance Tracker",
        "items": [
            "✅ Added: Weekly performance scoring",
            "✅ Added: Performance leaderboard & auto-flags",
            "✅ Added: Excel export with embedded trend chart",
            "✅ Added: Recommendation engine"
        ]
    },
    "1.0.5α": {
        "date": "25 Jun 2026",
        "summary": "Admin Override Checker Update",
        "items": [
            "✅ Added: Change Checker dropdown in Admin Override Control",
            "✅ Improved: Audit trail now logs checker changes",
            "✅ Improved: SOP for handling checker swaps"
        ]
    },
    "1.0.4α": {
        "date": "25 Jun 2026",
        "summary": "TSA Discrepancy Tracker",
        "items": [
            "✅ Added: TSA Case Tracker for outlet discrepancies",
            "✅ Added: Kurang Kirim / Lebih Kirim reporting",
            "✅ Added: Investigation timeline & status tracking",
            "✅ Added: Analytics for problematic outlets & items",
            "✅ Added: Hardcoded reporters (Khaifah & Tari)"
        ]
    },
    "1.0.3α": {
        "date": "24 Jun 2026",
        "summary": "Staff Management & OT Tracker",
        "items": [
            "✅ Added: Staff roster management",
            "✅ Added: Daily OT logging with auto cost calculation",
            "✅ Added: Monthly OT summary",
            "✅ Added: Excel export for OT reports",
            "✅ Added: Role-based access"
        ]
    },
    "1.0.2α": {
        "date": "24 Jun 2026",
        "summary": "Security hardening & Live Packing Board fix",
        "items": [
            "✅ Added: 15-minute idle auto-logout for security",
            "✅ Added: PIN lockout after 3 failed attempts",
            "✅ Added: Critical action re-authentication (Deploy/Revoke/Override)",
            "✅ Added: Role-based export restrictions (Admin/Manager only)",
            "✅ Fixed: Live Packing Board now auto-refreshes correctly",
            "✅ Improved: Premium version badge in sidebar"
        ]
    },
    "1.0.1α": {
        "date": "23 Jun 2026",
        "summary": "Inline editing & Admin Override",
        "items": [
            "✅ Feature: Inline editable Outlet Directory",
            "✅ Feature: Admin Override Control for packing status",
            "✅ Fixed: Streamlit form callback errors resolved"
        ]
    },
    "1.0.0α": {
        "date": "22 Jun 2026",
        "summary": "Initial release",
        "items": [
            "🚀 Initial release of Jesta Command Center v5.0 WEB EDITION",
            "🔐 Role-based access with 6-digit PIN authentication",
            "📊 Tabs: Access Control, Master Data, Packing Board, Analytics, etc."
        ]
    }
}

# Role Definitions (FIXED: Removed all trailing spaces from keys and values)
ROLES = {
    "Admin": {
        "pin_secret": "ADMIN_PIN",
        "default_pin": "123456",
        "tabs": ["Access Control", "Master Data", "Barcode", "Outlet", "Stock", "Manifests", "Packing Board", "Inbound Planner", "Inbound Logs", "Analytics", "Overwatch", "Audit Trail", "Staff & OT", "TSA Tracker", "Checker Management"]
    },
    "JendralVittoria": {
        "pin_secret": "MANAGER_PIN",
        "default_pin": "654321",
        "tabs": ["Master Data", "Barcode", "Outlet", "Stock", "Packing Board", "Inbound Planner", "Inbound Logs", "Analytics", "Overwatch", "Audit Trail", "Staff & OT", "TSA Tracker", "Checker Management"]
    },
    "InventoryVittoria": {
        "pin_secret": "STAFF_PIN",
        "default_pin": "111111",
        "tabs": ["Master Data", "Barcode", "Outlet", "Stock", "Inbound Planner", "Analytics"]
    },
    "TSAVittoria": {
        "pin_secret": "TSA_PIN",
        "default_pin": "333333",
        "tabs": ["Outlet", "Manifests", "Packing Board", "Staff & OT", "TSA Tracker"]
    },
    "LogisticVittoria": {
        "pin_secret": "LOGISTIC_PIN",
        "default_pin": "444444",
        "tabs": ["Master Data", "Barcode", "Inbound Planner", "Inbound Logs", "Outlet", "Manifests", "Packing Board"]
    }
}

st.set_page_config(page_title="Jesta Command Center", layout="wide", page_icon="🛡️")

# ==========================================
# AUDIT LOGGER HELPER
# ==========================================
def log_audit(action_type, details, user="Unknown", role="Unknown"):
    """Silently logs an action to the server in the background."""
    def _post():
        try:
            wib_now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7)))
            payload = {
                "timestamp": wib_now.strftime("%Y-%m-%d %H:%M:%S"),
                "user": user,
                "role": role,
                "action_type": action_type,
                "details": details
            }
            requests.post(f"{BASE_URL}/api/audit_logs", json=payload, timeout=3)
        except:
            pass
    threading.Thread(target=_post, daemon=True).start()

# ==========================================
# SESSION STATE INITIALIZATION
# ==========================================
if 'logged_in' not in st.session_state:
    st.session_state.logged_in = False
if 'current_user' not in st.session_state:
    st.session_state.current_user = None
if 'user_role' not in st.session_state:
    st.session_state.user_role = None
if 'master_data' not in st.session_state: st.session_state.master_data = None
if 'current_stock' not in st.session_state: st.session_state.current_stock = None
if 'users' not in st.session_state: st.session_state.users = []
if 'manifests' not in st.session_state: st.session_state.manifests = []
if 'inbound_logs' not in st.session_state: st.session_state.inbound_logs = []
if 'reports' not in st.session_state: st.session_state.reports = []
if 'overwatch_hwid' not in st.session_state: st.session_state.overwatch_hwid = None
if 'overwatch_logs' not in st.session_state: st.session_state.overwatch_logs = []
if 'intercepted_files' not in st.session_state: st.session_state.intercepted_files = []

# --- NEW: SECURITY TRACKING ---
if 'last_activity' not in st.session_state:
    st.session_state.last_activity = datetime.datetime.now()
if 'failed_attempts' not in st.session_state:
    st.session_state.failed_attempts = {}
if 'lockout_until' not in st.session_state:
    st.session_state.lockout_until = {}

# --- NEW: CHANGELOG TRACKING ---
if 'changelog_seen' not in st.session_state:
    st.session_state.changelog_seen = {}

# --- NEW: TSA TRACKER STATE ---
if 'tsa_cases' not in st.session_state:
    st.session_state.tsa_cases = []
if 'tsa_selected_case' not in st.session_state:
    st.session_state.tsa_selected_case = None
if 'tsa_custody_records' not in st.session_state:
    st.session_state.tsa_custody_records = []
if 'tsa_custody_selected' not in st.session_state:
    st.session_state.tsa_custody_selected = None

# --- NEW: PERFORMANCE TRACKER STATE ---
if 'perf_scores' not in st.session_state:
    st.session_state.perf_scores = {}
if 'perf_staff_id' not in st.session_state:
    st.session_state.perf_staff_id = None

# ==========================================
# LOGIN SCREEN (WITH LOCKOUT & IDLE TRACKING)
# ==========================================
if not st.session_state.logged_in:
    st.markdown("<h1 style='text-align: center;'>🛡️ JESTA COMMAND CENTER</h1>", unsafe_allow_html=True)
    st.markdown("<p style='text-align: center;'>Select your account to login</p>", unsafe_allow_html=True)
    st.divider()
    col1, col2, col3 = st.columns([1, 2, 1])
    with col2:
        with st.form("login_form"):
            username = st.selectbox("Select User", list(ROLES.keys()), key="login_user_select")
            pin = st.text_input("Password (6-Digit PIN)", type="password", max_chars=6, key="login_pin")
            submitted = st.form_submit_button("🔓 UNLOCK APP")
            if submitted:
                # --- NEW: CHECK LOCKOUT STATUS ---
                current_time = datetime.datetime.now()
                if username in st.session_state.lockout_until:
                    if current_time < st.session_state.lockout_until[username]:
                        remaining = (st.session_state.lockout_until[username] - current_time).total_seconds()
                        minutes = int(remaining // 60)
                        seconds = int(remaining % 60)
                        st.error(f"⛔ Account temporarily locked. Please wait {minutes}:{seconds:02d} before trying again.")
                        st.stop()
                    else:
                        # Lockout expired, reset
                        st.session_state.lockout_until[username] = None
                        st.session_state.failed_attempts[username] = 0
                # ---------------------------------
                user_config = ROLES[username]
                # FIXED: Strip spaces to ensure exact match with secrets.toml
                pin_secret_key = user_config["pin_secret"].strip()
                default_pin = user_config["default_pin"].strip()
                expected_pin = st.secrets.get(pin_secret_key, default_pin)
                
                # --- WORKING HOURS RESTRICTION (08:00 - 16:00 WIB) ---
                current_hour_wib = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).hour
                if username in ["InventoryVittoria", "TSAVittoria", "LogisticVittoria"]:
                    if current_hour_wib < 8 or current_hour_wib >= 16:
                        current_time_str = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).strftime('%H:%M')
                        st.error(f"⛔ Access Denied. Working hours are 08:00 - 16:00 WIB.\nCurrent WIB Time: {current_time_str}")
                        log_audit("ACCESS_DENIED", f"Attempted login outside working hours (08:00-16:00)", user=username, role=username)
                        st.stop()
                # ---------------------------------------------------------
                if pin == expected_pin:
                    # Reset failed attempts on success
                    st.session_state.failed_attempts[username] = 0
                    st.session_state.logged_in = True
                    st.session_state.current_user = username
                    st.session_state.user_role = username
                    st.session_state.last_activity = datetime.datetime.now()
                    log_audit("LOGIN", "Successfully logged into Admin Panel", user=username, role=username)
                    st.rerun()
                else:
                    # Track failed attempts
                    st.session_state.failed_attempts[username] = st.session_state.failed_attempts.get(username, 0) + 1
                    if st.session_state.failed_attempts[username] >= 3:
                        # Lockout for 5 minutes
                        st.session_state.lockout_until[username] = datetime.datetime.now() + datetime.timedelta(minutes=5)
                        st.error("⛔ Too many failed attempts. Account locked for 5 minutes.")
                        log_audit("LOGIN_LOCKOUT", f"Account locked after 3 failed attempts", user=username, role="Unknown")
                    else:
                        remaining = 3 - st.session_state.failed_attempts[username]
                        st.error(f"❌ Invalid PIN. {remaining} attempt(s) remaining before lockout.")
                    log_audit("LOGIN_FAILED", f"Failed login attempt (Wrong PIN). Attempt {st.session_state.failed_attempts[username]}/3", user=username, role="Unknown")
    st.stop()

# If we reach here, user is logged in
current_user = st.session_state.current_user
user_role = st.session_state.user_role
accessible_tabs = ROLES[user_role]["tabs"]

# --- NEW: IDLE TIMEOUT CHECK ---
IDLE_TIMEOUT_MINUTES = 15
current_time = datetime.datetime.now()
idle_duration = (current_time - st.session_state.last_activity).total_seconds() / 60
if idle_duration > IDLE_TIMEOUT_MINUTES:
    # Auto-logout
    log_audit("SESSION_TIMEOUT", f"Auto-logged out after {idle_duration:.1f} minutes of inactivity", user=current_user, role=user_role)
    st.session_state.logged_in = False
    st.session_state.current_user = None
    st.session_state.user_role = None
    st.session_state.last_activity = datetime.datetime.now()
    st.rerun()

# Update last activity on any interaction
def update_activity():
    st.session_state.last_activity = datetime.datetime.now()

# Bind activity update to common events
st.session_state.last_activity = datetime.datetime.now()  # Reset on page load

# ==========================================
# NEW: CHANGELOG DIALOG
# ==========================================
@st.dialog(f"✨ What's New in v{APP_VERSION}")
def changelog_dialog():
    """Shows the changelog for the current version."""
    changelog = CHANGELOGS.get(APP_VERSION, {})
    st.markdown(f"**🗓️ Released:** {changelog.get('date', 'Unknown')}")
    st.markdown(f"**📋 Summary:** {changelog.get('summary', 'No summary available')}")
    st.divider()
    for item in changelog.get('items', []):
        st.markdown(f"• {item}")
    st.divider()
    # Show older versions
    with st.expander("📜 View Older Versions"):
        for version in sorted(CHANGELOGS.keys(), reverse=True):
            if version != APP_VERSION:
                old_changelog = CHANGELOGS[version]
                st.markdown(f"**🔖 v{version}** ({old_changelog.get('date', '')})")
                st.markdown(f"*{old_changelog.get('summary', '')}*")
                for item in old_changelog.get('items', []):
                    st.markdown(f"  • {item}")
                st.divider()
    if st.button("✅ Got It", type="primary", use_container_width=True):
        # Mark this version as seen for this session
        st.session_state.changelog_seen[APP_VERSION] = True
        st.rerun()

# ==========================================
# SIDEBAR WITH PREMIUM BADGE
# ==========================================
with st.sidebar:
    st.markdown(f"👤 Logged in as: {current_user}")
    st.markdown(f"🎭 Role: {user_role}")
    st.divider()
    # --- NEW: PREMIUM VERSION BADGE ---
    st.markdown(
        f"<div style='text-align:center; padding:10px 0; border-top:1px solid #e0e0e0; margin-top:8px'>"
        f"<small style='color:#666'>🔐 Production-Live <strong style='color:#333'>v{APP_VERSION}</strong></small><br>"
        f"<em style='color:#999; font-size:0.85em; font-style:italic'>Made by A. Majesta P.</em>"
        f"</div>", 
        unsafe_allow_html=True
    )
    # -----------------------------------
    if st.button("🚪 LOGOUT", key="btn_logout", on_click=update_activity):
        log_audit("LOGOUT", "Logged out of Admin Panel", user=current_user, role=user_role)
        st.session_state.logged_in = False
        st.session_state.current_user = None
        st.session_state.user_role = None
        st.rerun()
    st.divider()
    # --- NEW: MANUAL CHANGELOG ACCESS ---
    if st.button("📋 View Changelog", key="btn_changelog_manual"):
        changelog_dialog()
    # ------------------------------------

# ==========================================
# NEW: AUTO-SHOW CHANGELOG ON LOGIN
# ==========================================
# Show changelog popup if user hasn't seen this version yet
if st.session_state.logged_in and not st.session_state.changelog_seen.get(APP_VERSION):
    changelog_dialog()
    # Mark as seen to prevent showing again this session
    st.session_state.changelog_seen[APP_VERSION] = True

# ==========================================
# DIALOGS (POP-UPS)
# ==========================================
@st.dialog("🔐 Confirm Critical Action")
def confirm_action_dialog(action_name, callback, *args, **kwargs):
    """Reusable dialog for critical action confirmation with PIN re-entry."""
    st.write(f"You are about to: {action_name}")
    st.write(f"User: {current_user}")
    st.write(f"Time: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')} WIB")
    st.divider()
    pin = st.text_input("Enter your 6-digit PIN to confirm", type="password", max_chars=6, key="confirm_pin")
    c1, c2 = st.columns(2)
    if c1.button("❌ Cancel", use_container_width=True):
        st.session_state.pending_action = None
        st.rerun()
    if c2.button("✅ Confirm & Execute", type="primary", use_container_width=True):
        user_config = ROLES.get(current_user, {})
        pin_secret_key = user_config.get("pin_secret", "").strip()
        default_pin = user_config.get("default_pin", "").strip()
        expected_pin = st.secrets.get(pin_secret_key, default_pin)
        if pin == expected_pin:
            st.session_state.pending_action = None
            callback(*args, **kwargs)
            st.rerun()
        else:
            st.error("❌ Incorrect PIN. Action cancelled.")
            log_audit("CONFIRM_FAILED", f"Failed to confirm {action_name} (Wrong PIN)", user=current_user, role=user_role)

# --- Existing dialogs remain unchanged ---
@st.dialog("⏪ Database Time Machine")
def time_machine_dialog():
    st.write("Select a historical state to review:")
    try:
        res = requests.get(f"{BASE_URL}/api/master_backups", params={"admin_key": ADMIN_PASS})
        backups = res.json() if res.status_code == 200 else []
    except requests.exceptions.RequestException:
        backups = []
    if not backups:
        st.info("No historical backups found on the server yet.")
        if st.button("Close", key="btn_close_time_machine_empty"): st.session_state.show_time_machine = False; st.rerun()
        return
    selected = st.selectbox("Choose Backup", backups, key="select_backup")
    if st.button("📥 LOAD INTO GRID", key="btn_load_backup"):
        res = requests.get(f"{BASE_URL}/api/master_backups/{selected}", params={"admin_key": ADMIN_PASS})
        if res.status_code == 200:
            st.session_state.master_data = res.json()
            st.session_state.show_time_machine = False
            st.success("State restored! Review the grid and click 'DEPLOY' to make it live.")
            st.rerun()
    if st.button("Cancel", key="btn_cancel_time_machine"): st.session_state.show_time_machine = False; st.rerun()

@st.dialog("🔴 Red Date Manager")
def red_dates_dialog():
    md = st.session_state.master_data
    if "HOLIDAYS" not in md: md["HOLIDAYS"] = []
    st.write("**Active Red Dates:**")
    st.write(", ".join(sorted(md["HOLIDAYS"])) if md["HOLIDAYS"] else "None")
    st.divider()
    new_date = st.date_input("Add Date (YYYY-MM-DD)", datetime.datetime.now(), key="date_input_red").strftime("%Y-%m-%d")
    if st.button("➕ Add Date", key="btn_add_red_date"):
        if new_date not in md["HOLIDAYS"]:
            md["HOLIDAYS"].append(new_date)
            st.rerun()
    st.divider()
    st.write("**Remove Date:**")
    if md["HOLIDAYS"]:
        to_remove = st.selectbox("Select Date to Remove", sorted(md["HOLIDAYS"]), key="select_remove_red_date")
        if st.button("🗑️ Remove Selected", key="btn_remove_red_date"):
            md["HOLIDAYS"].remove(to_remove)
            st.rerun()
    else:
        st.info("No red dates to remove.")
    if st.button("💾 SAVE & CLOSE", key="btn_save_red_dates"):
        st.session_state.show_red_dates = False
        st.rerun()

@st.dialog("📊 Stock Movement Ledger")
def ledger_dialog():
    sku = st.session_state.view_ledger_sku
    st.subheader(f"Target: {sku}")
    try:
        res = requests.get(f"{BASE_URL}/api/ledger/get", params={"admin_key": ADMIN_PASS})
        if res.status_code == 200:
            data = res.json()
            logs = data.get(sku, [])
            if logs:
                rows = []
                for log in reversed(logs):
                    qty = log.get("qty", 0)
                    qty_str = f"{qty}" if qty < 0 else f"+{qty}"
                    rows.append({
                        "Date & Time": log.get("timestamp", ""),
                        "Operator": log.get("operator", ""),
                        "Destination/Source": log.get("outlet", ""),
                        "Movement": qty_str
                    })
                st.dataframe(pd.DataFrame(rows), width="stretch", hide_index=True, key="df_ledger")
            else:
                st.info("No movement data found.")
    except requests.exceptions.RequestException:
        st.error("Failed to fetch ledger.")
    if st.button("Close", key="btn_close_ledger"):
        st.session_state.view_ledger_sku = None
        st.rerun()

@st.dialog("🚛 Manifest Details")
def manifest_details_dialog():
    manifests = st.session_state.manifests
    names = [m.get("manifest_name") for m in manifests]
    sel = st.selectbox("Select Manifest", names, key="select_manifest_details")
    m = next((x for x in manifests if x.get("manifest_name") == sel), None)
    if m:
        st.write(f"**Truck:** {m.get('truck_plate')} | **Driver:** {m.get('driver')}")
        st.write(f"**Status:** {m.get('status')} | **Created:** {m.get('created_at')}")
        outlets = m.get("outlets", [])
        if outlets:
            df = pd.DataFrame([{"Outlet Name": o.get("outlet"), "Delivery No": o.get("delivery_no"), "Weight (kg)": o.get("weight_kg", 0)} for o in outlets])
            st.dataframe(df, width="stretch", hide_index=True, key="df_manifest_details")
            total_w = sum(o.get("weight_kg", 0) for o in outlets)
            st.metric("Total Weight", f"{total_w:.2f} kg")
    if st.button("Close", key="btn_close_manifest"):
        st.session_state.view_manifest = False
        st.rerun()

# ==========================================
# TAB 1: ACCESS CONTROL & RADAR
# ==========================================
def tab_access_control():
    st.subheader("🔓 Register / Renew User")
    with st.form("reg_form"):
        c1, c2, c3 = st.columns(3)
        hwid = c1.text_input("HWID", key="reg_hwid")
        alias = c2.text_input("Alias (Name)", key="reg_alias")
        days = c3.number_input("Days", value=30, min_value=1, key="reg_days")
        if st.form_submit_button("🔓 AUTHORIZE", key="btn_authorize", on_click=update_activity):
            if hwid and alias:
                expiry = (datetime.datetime.now() + datetime.timedelta(days=int(days))).strftime("%Y%m%d")
                res = requests.post(f"{BASE_URL}/register_user", json={"admin_key": ADMIN_PASS, "hwid": hwid, "alias": alias, "status": "ACTIVE", "expiry": expiry})
                if res.status_code == 200:
                    st.success(f"Registered {alias} until {expiry}")
                    log_audit("REGISTER", f"Registered new user: {alias} (HWID: {hwid}) for {days} days", user=current_user, role=user_role)
                    st.session_state.users = [] # force refresh
                    st.rerun()
                else:
                    st.error("Failed to register.")
            else:
                st.error("Fill all fields.")
    st.divider()
    st.subheader("📡 Active Database & Live Radar")
    if not st.session_state.users:
        try:
            res = requests.get(f"{BASE_URL}/list_users", params={"admin_key": ADMIN_PASS})
            if res.status_code == 200: st.session_state.users = res.json()
        except requests.exceptions.RequestException:
            pass
    @st.fragment(run_every=5)
    def live_radar_fragment():
        users = st.session_state.users
        if not users:
            st.warning("No users found.")
            return
        try:
            res = requests.get(f"{BASE_URL}/api/live_status", params={"admin_key": ADMIN_PASS})
            live_data = res.json() if res.status_code == 200 else {}
        except requests.exceptions.RequestException:
            live_data = {}
        now = datetime.datetime.now().timestamp()
        rows = []
        for u in users:
            hwid = u.get('hwid', '')
            info = live_data.get(hwid, {})
            last_seen = info.get('last_seen', 0)
            status_text = info.get('status', 'Idle')
            is_live = (now - last_seen) < 90
            rows.append({
                "Hardware ID": hwid,
                "Device Alias": u.get('alias', 'Unknown'),
                "Access": u.get('status', ''),
                "Expires": u.get('expiry', ''),
                "Live Activity": f"🟢 {status_text}" if is_live else "⚫ Offline"
            })
        st.dataframe(pd.DataFrame(rows), width="stretch", hide_index=True, key="df_radar")
    live_radar_fragment()
    st.divider()
    c1, c2 = st.columns(2)
    with c1:
        if st.button("🔄 FORCE FULL REFRESH", key="btn_refresh_users", on_click=update_activity):
            st.session_state.users = []
            st.rerun()
    with c2:
        hwids = [u.get('hwid') for u in st.session_state.users]
        if hwids:
            target = st.selectbox("Select Device to Revoke", hwids, key="select_revoke_hwid")
            if st.button("💀 REVOKE SELECTED", key="btn_revoke", on_click=update_activity):
                # --- NEW: CRITICAL ACTION RE-AUTH ---
                def _revoke_action(hwid):
                    res = requests.post(f"{BASE_URL}/revoke_user", json={"admin_key": ADMIN_PASS, "hwid": hwid})
                    if res.status_code == 200:
                        st.success("Revoked.")
                        log_audit("REVOKE", f"Revoked access for HWID: {hwid}", user=current_user, role=user_role)
                        st.session_state.users = []
                        st.rerun()
                if current_user in ["Admin", "JendralVittoria"]:
                    confirm_action_dialog(f"REVOKE USER: {target}", _revoke_action, target)
                else:
                    st.error("❌ Insufficient permissions to revoke users.")
                # ------------------------------------

# ==========================================
# TAB 2: MASTER DATA MANAGER
# ==========================================
def tab_master_data():
    c1, c2, c3 = st.columns([1, 1, 1])
    if c1.button("⬇️ Fetch Current Data", key="btn_fetch_master", on_click=update_activity):
        try:
            res = requests.get(f"{BASE_URL}/api/master_data")
            if res.status_code == 200:
                st.session_state.master_data = res.json()
                st.rerun()
        except requests.exceptions.RequestException:
            st.error("Failed to fetch.")
    if c2.button("⏪ Time Machine (Rollback)", key="btn_time_machine", on_click=update_activity):
        st.session_state.show_time_machine = True
    if c3.button("🚀 DEPLOY UPDATES TO CLOUD", key="btn_deploy_master", on_click=update_activity):
        if st.session_state.master_data:
            # --- NEW: CRITICAL ACTION RE-AUTH ---
            def _deploy_master():
                res = requests.post(f"{BASE_URL}/api/master_data", json={"admin_key": ADMIN_PASS, "master_data": st.session_state.master_data})
                if res.status_code == 200:
                    st.success("Deployed!")
                    log_audit("DEPLOY_MASTER", "Deployed updates to Master Data to cloud", user=current_user, role=user_role)
                else:
                    st.error("Deploy failed.")
            if current_user in ["Admin", "JendralVittoria"]:
                confirm_action_dialog("DEPLOY MASTER DATA", _deploy_master)
            else:
                st.error("❌ Insufficient permissions to deploy Master Data.")
            # ------------------------------------
    if st.session_state.master_data is None:
        st.info("Click 'Fetch Current Data' to start.")
        return
    md = st.session_state.master_data
    st.subheader("🌍 Global Packing Settings")
    tol = st.number_input("System-Wide Box Tolerance", value=md.get("BOX_TOLERANCE", 1.859), step=0.001, format="%.3f", key="input_tolerance", on_change=update_activity)
    md["BOX_TOLERANCE"] = tol
    st.subheader("📦 SKU Inventory Database (Inline Editable)")
    rows = []
    cats = md.get("CATEGORIES", {})
    uoms = md.get("ITEM_UOM", {})
    caps = md.get("BOX_CAPACITY", {})
    weights = md.get("ITEM_WEIGHT_GRAMS", {})
    for cat, skus in cats.items():
        for sku in skus:
            rows.append({
                "SKU Name": sku,
                "Warehouse Category": cat,
                "UOM": uoms.get(sku, "Pack"),
                "Box Capacity": caps.get(sku, 1),
                "Weight (grams)": weights.get(sku, 0)
            })
    df = pd.DataFrame(rows)
    edited_df = st.data_editor(df, num_rows="dynamic", width="stretch", hide_index=True, key="editor_master_skus", on_change=update_activity)
    c1, c2 = st.columns(2)
    if c2.button("📅 Manage Red Dates", key="btn_red_dates", on_click=update_activity):
        st.session_state.show_red_dates = True
    # Save edits back to master_data
    new_cats = {}
    new_uoms = {}
    new_caps = {}
    new_weights = {}
    for _, row in edited_df.iterrows():
        sku = row['SKU Name']
        cat = row['Warehouse Category']
        if not sku: continue
        if cat not in new_cats: new_cats[cat] = []
        if sku not in new_cats[cat]: new_cats[cat].append(sku)
        new_uoms[sku] = row['UOM']
        new_caps[sku] = int(row['Box Capacity'])
        new_weights[sku] = int(row['Weight (grams)'])
    md["CATEGORIES"] = new_cats
    md["ITEM_UOM"] = new_uoms
    md["BOX_CAPACITY"] = new_caps
    md["ITEM_WEIGHT_GRAMS"] = new_weights
    if st.session_state.get('show_time_machine'):
        time_machine_dialog()
    if st.session_state.get('show_red_dates'):
        red_dates_dialog()

# ==========================================
# TAB 3: KODE BARANG MANAGER
# ==========================================
def tab_kode_barang():
    c1, c2 = st.columns(2)
    if c1.button("⬇️ Fetch Current Data", key="btn_fetch_kode", on_click=update_activity):
        try:
            res = requests.get(f"{BASE_URL}/api/master_data")
            if res.status_code == 200: st.session_state.master_data = res.json(); st.rerun()
        except requests.exceptions.RequestException:
            st.error("Failed.")
    if c2.button("🚀 DEPLOY UPDATES TO CLOUD", key="btn_deploy_kode", on_click=update_activity):
        if st.session_state.master_data:
            # --- NEW: CRITICAL ACTION RE-AUTH ---
            def _deploy_kode():
                res = requests.post(f"{BASE_URL}/api/master_data", json={"admin_key": ADMIN_PASS, "master_data": st.session_state.master_data})
                if res.status_code == 200:
                    st.success("Deployed!")
                    log_audit("DEPLOY_MASTER", "Deployed updates to Master Data (via Barcode Tab)", user=current_user, role=user_role)
            if current_user in ["Admin", "JendralVittoria"]:
                confirm_action_dialog("DEPLOY MASTER DATA", _deploy_kode)
            else:
                st.error("❌ Insufficient permissions to deploy Master Data.")
            # ------------------------------------
    if not st.session_state.master_data:
        st.info("Fetch data first.")
        return
    md = st.session_state.master_data
    if "KODE_BARANG" not in md: md["KODE_BARANG"] = {}
    st.subheader("🏷️ Map New Barcode / Kode Barang")
    all_skus = []
    for skus in md.get("CATEGORIES", {}).values(): all_skus.extend(skus)
    c1, c2, c3 = st.columns([1, 1, 1])
    kode = c1.text_input("Kode Barang (e.g. BP-SML)", key="input_kode", on_change=update_activity).strip().upper()
    sku = c2.selectbox("Translates To (System SKU)", sorted(all_skus), key="select_kode_sku", on_change=update_activity)
    if c3.button("➕ Add / Update Mapping", key="btn_add_kode", on_click=update_activity):
        if kode and sku:
            md["KODE_BARANG"][kode] = sku
            st.success(f"Mapped {kode} to {sku}")
            log_audit("UPDATE_KODE", f"Mapped Barcode {kode} to SKU {sku}", user=current_user, role=user_role)
            st.rerun()
    st.subheader("Active Translations")
    kode_dict = md.get("KODE_BARANG", {})
    if kode_dict:
        df = pd.DataFrame([{"Kode": k, "System Name": v} for k, v in sorted(kode_dict.items())])
        st.dataframe(df, width="stretch", hide_index=True, key="df_kode")
        to_del = st.selectbox("Select to Remove", list(kode_dict.keys()), key="select_remove_kode", on_change=update_activity)
        if st.button("🗑️ Remove Selected", key="btn_remove_kode", on_click=update_activity):
            del md["KODE_BARANG"][to_del]
            log_audit("UPDATE_KODE", f"Removed Barcode mapping for {to_del}", user=current_user, role=user_role)
            st.rerun()
    else:
        st.info("No translations mapped yet.")

# ==========================================
# TAB 4: OUTLET DIRECTORY MANAGER (INLINE EDITABLE)
# ==========================================
def tab_outlets():
    c1, c2 = st.columns(2)
    if c1.button("⬇️ Fetch Current Data", key="btn_fetch_outlets", on_click=update_activity):
        try:
            res = requests.get(f"{BASE_URL}/api/master_data")
            if res.status_code == 200: st.session_state.master_data = res.json(); st.rerun()
        except requests.exceptions.RequestException:
            st.error("Failed.")
    if c2.button("🚀 DEPLOY UPDATES TO CLOUD", key="btn_deploy_outlets", on_click=update_activity):
        if st.session_state.master_data:
            # --- NEW: CRITICAL ACTION RE-AUTH ---
            def _deploy_outlets():
                res = requests.post(f"{BASE_URL}/api/master_data", json={"admin_key": ADMIN_PASS, "master_data": st.session_state.master_data})
                if res.status_code == 200:
                    st.success("Deployed!")
                    log_audit("DEPLOY_MASTER", "Deployed updates to Master Data (via Outlet Tab)", user=current_user, role=user_role)
            if current_user in ["Admin", "JendralVittoria"]:
                confirm_action_dialog("DEPLOY MASTER DATA", _deploy_outlets)
            else:
                st.error("❌ Insufficient permissions to deploy Master Data.")
            # ------------------------------------
    if not st.session_state.master_data:
        st.info("Fetch data first.")
        return
    md = st.session_state.master_data
    if "OUTLET_INFO" not in md: md["OUTLET_INFO"] = {}
    st.subheader("🏪 Outlet Directory (Inline Editable)")
    # Convert nested dict to flat DataFrame for editor
    outlet_rows = []
    for outlet_name, info in md.get("OUTLET_INFO", {}).items():
        outlet_rows.append({
            "Outlet Name": outlet_name,
            "Receiver Name": info.get("name", ""),
            "Phone": info.get("phone", ""),
            "Address": info.get("address", "")
        })
    df = pd.DataFrame(outlet_rows)
    # Configure columns for better UX
    column_config = {
        "Outlet Name": st.column_config.TextColumn("Outlet Name", required=True, help="Must be unique"),
        "Receiver Name": st.column_config.TextColumn("Receiver Name"),
        "Phone": st.column_config.TextColumn("Phone", help="e.g., 0812-3456-7890"),
        "Address": st.column_config.TextColumn("Address", width="large")
    }
    edited_df = st.data_editor(
        df,
        num_rows="dynamic",
        width="stretch",
        hide_index=True,
        key="editor_outlets",
        column_config=column_config,
        on_change=update_activity
    )
    # Convert edited DataFrame back to nested dict structure
    new_outlet_info = {}
    for _, row in edited_df.iterrows():
        outlet_name = row['Outlet Name'].strip().upper()
        if outlet_name: # Only add if name is not empty
            new_outlet_info[outlet_name] = {
                "name": row['Receiver Name'],
                "phone": row['Phone'],
                "address": row['Address']
            }
    # Update master_data with new structure
    md["OUTLET_INFO"] = new_outlet_info
    st.divider()
    st.info("💡 Tip: Edit cells directly. Add new rows with the '+' button. Click 'DEPLOY UPDATES' to save changes to the cloud.")

# ==========================================
# TAB 5: LIVE INVENTORY STOCK
# ==========================================
def tab_stock():
    c1, c2 = st.columns(2)
    if c1.button("⬇️ Fetch Live Stock", key="btn_fetch_stock", on_click=update_activity):
        try:
            res = requests.get(f"{BASE_URL}/api/current_stock")
            if res.status_code == 200: st.session_state.current_stock = res.json(); st.rerun()
        except requests.exceptions.RequestException:
            st.error("Failed.")
    if c2.button("🚀 DEPLOY STOCK TO CLOUD", key="btn_deploy_stock", on_click=update_activity):
        if st.session_state.current_stock is not None:
            # --- NEW: CRITICAL ACTION RE-AUTH ---
            def _deploy_stock():
                res = requests.post(f"{BASE_URL}/api/current_stock", json={"admin_key": ADMIN_PASS, "stock_data": st.session_state.current_stock})
                if res.status_code == 200:
                    st.success("Deployed!")
                    log_audit("DEPLOY_STOCK", "Deployed updates to Live Stock to cloud", user=current_user, role=user_role)
            if current_user in ["Admin", "JendralVittoria"]:
                confirm_action_dialog("DEPLOY LIVE STOCK", _deploy_stock)
            else:
                st.error("❌ Insufficient permissions to deploy stock.")
            # ------------------------------------
    if st.session_state.current_stock is None:
        st.info("Fetch stock first.")
        return
    stock = st.session_state.current_stock
    rows = [{"SKU Name": k, "Available Quantity": v} for k, v in sorted(stock.items())]
    df = pd.DataFrame(rows)
    st.subheader("🏢 Warehouse Current Stock (Inline Editable)")
    edited_df = st.data_editor(df, num_rows="dynamic", width="stretch", hide_index=True, key="editor_stock", on_change=update_activity)
    new_stock = {}
    for _, row in edited_df.iterrows():
        if row['SKU Name']:
            new_stock[row['SKU Name']] = int(row['Available Quantity'])
    st.session_state.current_stock = new_stock
    st.divider()
    st.subheader("📥 Import / Export")
    uploaded_file = st.file_uploader("Choose Excel/CSV to Import", type=['xlsx', 'xls', 'csv'], key="upload_stock_file", on_change=update_activity)
    if uploaded_file is not None:
        try:
            if uploaded_file.name.endswith('.csv'):
                imp_df = pd.read_csv(uploaded_file)
            else:
                imp_df = pd.read_excel(uploaded_file)
            imp_df.columns = [str(c).strip().upper() for c in imp_df.columns]
            sku_col = next((c for c in imp_df.columns if 'SKU' in c or 'NAME' in c or 'ITEM' in c), None)
            qty_col = next((c for c in imp_df.columns if 'QTY' in c or 'QUANTITY' in c or 'STOCK' in c), None)
            if sku_col and qty_col:
                for _, row in imp_df.iterrows():
                    sku = str(row[sku_col]).strip()
                    try:
                        qty = int(float(row[qty_col]))
                        if sku and sku.lower() != 'nan':
                            st.session_state.current_stock[sku] = qty
                    except: pass
                st.success("Imported to local memory. Click Deploy to push to cloud.")
                log_audit("IMPORT_STOCK", f"Imported stock from file: {uploaded_file.name}", user=current_user, role=user_role)
                st.rerun()
            else:
                st.error("Could not find 'SKU' and 'Quantity' columns.")
        except Exception as e:
            st.error(f"Failed to read file: {e}")
    if not df.empty:
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False)
        st.download_button("📤 Export Stock to Excel", output.getvalue(), "stock_inventory.xlsx", key="dl_stock", on_click=update_activity)
    st.divider()
    st.subheader("📊 View Stock Ledger")
    skus = list(st.session_state.current_stock.keys())
    if skus:
        sel_sku = st.selectbox("Select SKU to view ledger", skus, key="select_ledger_sku", on_change=update_activity)
        if st.button("View Ledger Intel", key="btn_view_ledger", on_click=update_activity):
            st.session_state.view_ledger_sku = sel_sku
    if st.session_state.get('view_ledger_sku'):
        ledger_dialog()

# ==========================================
# TAB 6: OUTBOUND MANIFESTS (WITH TIME TAKEN)
# ==========================================
def tab_manifests():
    c1, c2 = st.columns(2)
    if c1.button("🔄 Fetch Manifests", key="btn_fetch_manifests", on_click=update_activity):
        try:
            res = requests.get(f"{BASE_URL}/api/outbound_manifests")
            if res.status_code == 200: st.session_state.manifests = res.json(); st.rerun()
        except requests.exceptions.RequestException:
            st.error("Failed.")
    if not st.session_state.manifests:
        st.info("No manifests found.")
        return
    rows = []
    for m in st.session_state.manifests:
        outlets = m.get("outlets", [])
        total_w = sum(o.get("weight_kg", 0) for o in outlets)
        # Calculate Time Taken
        started = m.get("loading_started_at")
        finished = m.get("loading_finished_at")
        time_taken = "In Progress"
        if started and finished:
            try:
                start_dt = datetime.datetime.strptime(started, "%Y-%m-%d %H:%M:%S")
                end_dt = datetime.datetime.strptime(finished, "%Y-%m-%d %H:%M:%S")
                diff = end_dt - start_dt
                minutes = int(diff.total_seconds() / 60)
                time_taken = f"{minutes} mins"
            except:
                time_taken = "Error"
        rows.append({
            "Manifest Name": m.get("manifest_name"),
            "Truck Plate": m.get("truck_plate"),
            "Driver": m.get("driver"),
            "Status": m.get("status"),
            "Total Weight (kg)": f"{total_w:.2f}",
            "Outlets Count": len(outlets),
            "Time Taken": time_taken,
            "Created At": m.get("created_at")
        })
    df = pd.DataFrame(rows)
    st.dataframe(df, width="stretch", hide_index=True, key="df_manifests")
    c1, c2 = st.columns(2)
    if c1.button("👁️ View Details", key="btn_view_manifest", on_click=update_activity):
        st.session_state.view_manifest = True
    if not df.empty:
        export_rows = []
        for m in st.session_state.manifests:
            outlets = m.get("outlets", [])
            started = m.get("loading_started_at")
            finished = m.get("loading_finished_at")
            time_taken = "In Progress"
            if started and finished:
                try:
                    start_dt = datetime.datetime.strptime(started, "%Y-%m-%d %H:%M:%S")
                    end_dt = datetime.datetime.strptime(finished, "%Y-%m-%d %H:%M:%S")
                    diff = end_dt - start_dt
                    minutes = int(diff.total_seconds() / 60)
                    time_taken = f"{minutes} mins"
                except:
                    time_taken = "Error"
            if not outlets:
                export_rows.append({"Manifest Name": m.get("manifest_name"), "Truck Plate": m.get("truck_plate"), "Driver": m.get("driver"), "Status": m.get("status"), "Created At": m.get("created_at"), "Loaded By": m.get("loaded_by", ""), "Time Taken": time_taken, "Outlet Name": "", "Delivery No": "", "Weight (kg)": 0})
            else:
                for o in outlets:
                    export_rows.append({"Manifest Name": m.get("manifest_name"), "Truck Plate": m.get("truck_plate"), "Driver": m.get("driver"), "Status": m.get("status"), "Created At": m.get("created_at"), "Loaded By": m.get("loaded_by", ""), "Time Taken": time_taken, "Outlet Name": o.get("outlet", ""), "Delivery No": o.get("delivery_no", ""), "Weight (kg)": o.get("weight_kg", 0)})
        exp_df = pd.DataFrame(export_rows)
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            exp_df.to_excel(writer, index=False)
        # --- NEW: ROLE-BASED EXPORT RESTRICTION ---
        if current_user in ["Admin", "JendralVittoria"]:
            c2.download_button("📥 Export to Excel", output.getvalue(), "outbound_manifests.xlsx", key="dl_manifests", on_click=update_activity)
        else:
            c2.info("🔒 Export restricted to Admin/Manager roles")
        # -------------------------------------------
    if st.session_state.get('view_manifest'):
        manifest_details_dialog()

# ==========================================
# TAB: LIVE PACKING BOARD (WITH ADMIN OVERRIDE) - FIXED
# ==========================================
def tab_packing_board():
    st.subheader("📡 Live Packing Board")
    # Manual Refresh Button
    if st.button("🔄 Force Refresh", use_container_width=True, key="btn_force_refresh_packing", on_click=update_activity):
        if 'packing_data' in st.session_state:
            del st.session_state.packing_data
        if 'pb_filtered_df' in st.session_state:
            del st.session_state.pb_filtered_df
        st.rerun()
    # Date Filters
    c1, c2 = st.columns(2)
    start_date = c1.date_input("Start Date", value=datetime.date.today() - datetime.timedelta(days=7), key="pb_start_date", on_change=update_activity)
    end_date = c2.date_input("End Date", value=datetime.date.today(), key="pb_end_date", on_change=update_activity)
    # Auto-refresh fragment
    @st.fragment(run_every=5)
    def live_packing_fragment():
        try:
            res = requests.get(f"{BASE_URL}/api/packing_status", timeout=5)
            if res.status_code == 200:
                st.session_state.packing_data = res.json()
            else:
                st.session_state.packing_data = []
        except requests.exceptions.RequestException:
            st.session_state.packing_data = []
        data = st.session_state.get("packing_data", [])
        if not data:
            st.info("No packing data found. Start packing lists will appear here once exported.")
            return
        # Client-side date filtering
        filtered = []
        for entry in data:
            created_at = entry.get("created_at", "")
            if created_at:
                try:
                    entry_date = datetime.datetime.strptime(created_at.split(" ")[0], "%Y-%m-%d").date()
                    if start_date <= entry_date <= end_date:
                        filtered.append(entry)
                except:
                    pass
        if not filtered:
            st.warning("No deliveries found for the selected date range.")
            return
        # Prepare display dataframe
        rows = []
        for entry in filtered:
            status = entry.get("status", "PENDING")
            if status == "READY":
                display_status = "🟢 READY"
            elif status == "IN PROGRESS":
                display_status = "🟡 PACKING"
            elif status == "CANCELLED":
                display_status = "❌ CANCELLED"
            else:
                display_status = "⚪ PENDING"
            rows.append({
                "Delivery No": entry.get("delivery_no", ""),
                "Outlet": entry.get("outlet", ""),
                "Checker": entry.get("checker", ""),
                "Status": display_status,
                "Scanned At": entry.get("scanned_at", "--:--:--"),
                "Created At": entry.get("created_at", ""),
                "Weight (kg)": entry.get("total_weight_kg", 0.0)
            })
        df = pd.DataFrame(rows).sort_values(by="Created At", ascending=False)
        st.session_state.pb_filtered_df = df # Store for export
        st.dataframe(df, width="stretch", hide_index=True, key="df_packing_live")
    # --- FIX: Call the fragment function to register it with Streamlit ---
    live_packing_fragment()
    # ----------------------------------------------------------------------
    # Export button outside fragment
    st.divider()
    if 'pb_filtered_df' in st.session_state and not st.session_state.pb_filtered_df.empty:
        df_export = st.session_state.pb_filtered_df
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            df_export.to_excel(writer, index=False)
        # --- NEW: ROLE-BASED EXPORT RESTRICTION ---
        if current_user in ["Admin", "JendralVittoria"]:
            st.download_button("📥 Export View to Excel", output.getvalue(), "packing_board_export.xlsx", key="dl_packing", on_click=update_activity)
        else:
            st.info("🔒 Export restricted to Admin/Manager roles")
        # -------------------------------------------
    # ==========================================
    #     NEW: ADMIN OVERRIDE CONTROL
    # ==========================================
    st.divider()
    st.subheader("⚙️ Admin Override Control")
    st.caption("*Use this to manually correct checker errors or cancel a shipment.*")
    # Get delivery numbers from the currently filtered view (fallback to raw data if fragment hasn't populated yet)
    filtered_df = st.session_state.get("pb_filtered_df", pd.DataFrame())
    if not filtered_df.empty:
        delivery_options = filtered_df["Delivery No"].tolist()
    else:
        raw_data = st.session_state.get("packing_data", [])
        delivery_options = [e.get("delivery_no") for e in raw_data if e.get("delivery_no")]
    # Get unique checkers for the dropdown
    raw_data_for_checkers = st.session_state.get("packing_data", [])
    checker_options = sorted(list(set(e.get("checker", "Unknown") for e in raw_data_for_checkers if e.get("checker"))))
    if not checker_options:
        checker_options = ["Unknown"]
    if not delivery_options:
        st.info("No active deliveries in the current view to override.")
    else:
        with st.form("override_form"):
            oc1, oc2 = st.columns(2)
            # --- FIX: No on_change inside form ---
            selected_do = oc1.selectbox("Delivery No", options=delivery_options, key="override_do")
            new_status = oc2.selectbox("New Status", options=["🟡 PACKING", "🟢 READY", "❌ CANCELLED"], key="override_status")
            oc3, oc4 = st.columns(2)
            new_checker = oc3.selectbox("Change Checker", options=checker_options, key="override_checker")
            reason = oc4.text_input("Reason for Override", key="override_reason")
            # --------------------------------------------------------------------------
            submitted = st.form_submit_button("🚀 APPLY OVERRIDE", type="primary", use_container_width=True, on_click=update_activity)
            if submitted:
                if not reason.strip():
                    st.error("Please provide a reason for the override.")
                else:
                    # --- NEW: CRITICAL ACTION RE-AUTH ---
                    def _apply_override():
                        status_map = {
                            "🟡 PACKING": "IN PROGRESS",
                            "🟢 READY": "READY",
                            "❌ CANCELLED": "CANCELLED"
                        }
                        backend_status = status_map[new_status]
                        packing_data = st.session_state.get("packing_data", [])
                        target_entry = next((e for e in packing_data if e.get("delivery_no") == selected_do), None)
                        if target_entry:
                            old_checker = target_entry.get("checker", "Unknown")
                            payload = {
                                "delivery_no": selected_do,
                                "outlet": target_entry.get("outlet", "Unknown"),
                                "checker": new_checker,
                                "status": backend_status,
                                "total_weight_kg": target_entry.get("total_weight_kg", 0.0)
                            }
                            try:
                                res = requests.post(f"{BASE_URL}/api/packing_status", json=payload, timeout=5)
                                if res.status_code == 200:
                                    st.success(f"✅ Successfully updated {selected_do}.")
                                    log_audit("ADMIN_OVERRIDE", f"Changed {selected_do} to {backend_status} and Checker from {old_checker} to {new_checker}. Reason: {reason}", user=current_user, role=user_role)
                                    # Force refresh
                                    if 'packing_data' in st.session_state:
                                        del st.session_state.packing_data
                                    if 'pb_filtered_df' in st.session_state:
                                        del st.session_state.pb_filtered_df
                                    st.rerun()
                                else:
                                    st.error(f"Failed to update status. Server response: {res.text}")
                            except requests.exceptions.RequestException as e:
                                st.error(f"Network error: {e}")
                        else:
                            st.error("Could not find the original delivery data to update.")
                    if current_user in ["Admin", "JendralVittoria"]:
                        confirm_action_dialog(f"OVERRIDE STATUS: {selected_do} → {new_status} & CHECKER → {new_checker}", _apply_override)
                    else:
                        st.error("❌ Insufficient permissions to override packing status.")
                    # ------------------------------------

# ==========================================
# TAB 7: INBOUND PLANNER (WITH INLINE EDITABLE ITEMS)
# ==========================================
def tab_inbound_planner():
    st.subheader("📅 Inbound Planner")
    # Date selection (default to tomorrow)
    tomorrow = datetime.date.today() + datetime.timedelta(days=1)
    plan_date = st.date_input("Plan Date", value=tomorrow, key="plan_date_input", on_change=update_activity)
    plan_date_str = plan_date.strftime("%Y-%m-%d")
    # Fetch existing plan for this date
    try:
        res = requests.get(f"{BASE_URL}/api/inbound_plan", params={"date": plan_date_str})
        if res.status_code == 200:
            current_plan = res.json()
        else:
            current_plan = []
    except requests.exceptions.RequestException:
        current_plan = []
        st.error("Failed to fetch plan.")
    st.write(f"**Vendors scheduled for {plan_date_str}:**")
    if current_plan:
        for idx, vendor in enumerate(current_plan):
            with st.expander(f"🏭 {vendor.get('vendor_name', 'Unknown Vendor')}"):
                st.write("Expected Items:")
                items = vendor.get("items", [])
                if items:
                    items_df = pd.DataFrame(items)
                    st.dataframe(items_df, width="stretch", hide_index=True)
                else:
                    st.info("No items planned.")
                if st.button(f"🗑️ Remove {vendor.get('vendor_name')}", key=f"rm_vendor_{idx}", on_click=update_activity):
                    current_plan.pop(idx)
                    try:
                        requests.post(f"{BASE_URL}/api/inbound_plan", json={"date": plan_date_str, "vendors": current_plan})
                        log_audit("PLAN_UPDATE", f"Updated Inbound Plan for {plan_date_str}: Removed vendor {vendor.get('vendor_name')}", user=current_user, role=user_role)
                    except:
                        pass
                    st.rerun()
    else:
        st.info("No vendors planned for this date yet.")
    st.divider()
    st.subheader("➕ Add New Vendor Plan")
    # Fetch master data for SKU dropdown if not already loaded
    if st.session_state.master_data is None:
        try:
            res = requests.get(f"{BASE_URL}/api/master_data")
            if res.status_code == 200:
                st.session_state.master_data = res.json()
        except:
            pass
    all_skus = []
    if st.session_state.master_data:
        for skus in st.session_state.master_data.get("CATEGORIES", {}).values():
            all_skus.extend(skus)
    all_skus = sorted(list(set(all_skus)))
    with st.form("add_vendor_form"):
        # --- FIX: No on_change inside form ---
        vendor_name = st.text_input("Vendor Name", key="plan_vendor_name")
        st.write("Expected Items:")
        # Start with one empty row
        default_df = pd.DataFrame({"SKU": [all_skus[0] if all_skus else ""], "Qty": [0]})
        items_df = st.data_editor(
            default_df,
            num_rows="dynamic",
            width="stretch",
            column_config={
                "SKU": st.column_config.SelectboxColumn("SKU", options=all_skus, required=True),
                "Qty": st.column_config.NumberColumn("Quantity", min_value=0, step=1, required=True)
            },
            key="plan_items_editor",
            hide_index=True
            # --- No on_change inside form ---
        )
        submitted = st.form_submit_button("💾 Save Vendor Plan", on_click=update_activity)
        if submitted:
            if not vendor_name:
                st.error("Vendor Name is required.")
            else:
                # Filter out empty rows
                valid_items = items_df[items_df["SKU"].astype(str).str.strip() != ""].to_dict("records")
                new_vendor = {
                    "vendor_name": vendor_name,
                    "items": valid_items
                }
                current_plan.append(new_vendor)
                try:
                    res = requests.post(f"{BASE_URL}/api/inbound_plan", json={"date": plan_date_str, "vendors": current_plan})
                    if res.status_code == 200:
                        st.success(f"Saved plan for {vendor_name}!")
                        log_audit("PLAN_UPDATE", f"Updated Inbound Plan for {plan_date_str}: Added/Modified vendor {vendor_name}", user=current_user, role=user_role)
                        st.rerun()
                    else:
                        st.error("Failed to save plan.")
                except requests.exceptions.RequestException:
                    st.error("Network error.")

# ==========================================
# TAB 8: INBOUND LOGS (EXACT COLUMNS) - FIXED
# ==========================================
def tab_inbound():
    c1, c2 = st.columns(2)
    if c1.button("🔄 Fetch Inbound Logs", key="btn_fetch_inbound", on_click=update_activity):
        try:
            res = requests.get(f"{BASE_URL}/api/inbound_logs", params={"admin_key": ADMIN_PASS})
            if res.status_code == 200: st.session_state.inbound_logs = res.json(); st.rerun()
        except requests.exceptions.RequestException:
            st.error("Failed.")
    if not st.session_state.inbound_logs:
        st.info("No inbound logs found.")
        return
    df = pd.DataFrame(st.session_state.inbound_logs)
    # Exact columns requested: Timestamp, PIC, Warehouse, Supplier/Vendor, Item, UOM, PO Qty, Received Qty, Rejected Qty, Time to Load, Total Weight (kg)
    cols = ["timestamp", "pic", "warehouse", "vendor", "sku", "uom", "po_qty", "received_qty", "rejected_qty", "time_to_load", "total_weight_kg"]
    df = df[[c for c in cols if c in df.columns]]
    df.columns = ["Timestamp", "PIC", "Warehouse", "Supplier/Vendor", "Item", "UOM", "PO Qty", "Received Qty", "Rejected Qty", "Time to Load", "Total Weight (kg)"]
    # --- FIX: Convert mixed types in PO Qty column to prevent Arrow conversion error ---
    if 'PO Qty' in df.columns:
        df['PO Qty'] = df['PO Qty'].apply(lambda x: str(x) if pd.notna(x) else "")
    # ---------------------------------------------------------------------------------
    st.dataframe(df, width="stretch", hide_index=True, key="df_inbound")
    if not df.empty:
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False)
        # --- NEW: ROLE-BASED EXPORT RESTRICTION ---
        if current_user in ["Admin", "JendralVittoria"]:
            c2.download_button("📥 Export to Excel", output.getvalue(), "inbound_logs.xlsx", key="dl_inbound", on_click=update_activity)
        else:
            c2.info("🔒 Export restricted to Admin/Manager roles")
        # -------------------------------------------

# ==========================================
# TAB 9: ANALYTICS & REPORTS - WITH LINE CHART & BIAS - FIXED
# ==========================================
def tab_analytics():
    c1, c2 = st.columns(2)
    if c1.button("🔄 Fetch Latest Shift Reports", key="btn_fetch_reports", on_click=update_activity):
        try:
            res = requests.get(f"{BASE_URL}/api/shift_reports", params={"admin_key": ADMIN_PASS})
            if res.status_code == 200: st.session_state.reports = res.json(); st.rerun()
        except requests.exceptions.RequestException:
            st.error("Failed.")
    if c2.button("📥 Export Raw Ledger (CSV)", key="btn_export_ledger_csv", on_click=update_activity):
        try:
            res = requests.get(f"{BASE_URL}/api/ledger/get", params={"admin_key": ADMIN_PASS})
            if res.status_code == 200:
                ledger = res.json()
                rows = [["Timestamp", "SKU Name", "Operator", "Outlet/Destination", "Movement Type", "Quantity"]]
                for sku, logs in ledger.items():
                    for log in logs:
                        rows.append([log.get("timestamp", ""), sku, log.get("operator", ""), log.get("outlet", ""), log.get("type", "UNKNOWN"), log.get("qty", 0)])
                rows[1:] = sorted(rows[1:], key=lambda x: x[0], reverse=True)
                output = io.StringIO()
                writer = csv.writer(output)
                writer.writerows(rows)
                st.download_button("⬇️ Download CSV", output.getvalue().encode('utf-8'), "vittoria_raw_ledger.csv", "text/csv", key="dl_ledger_csv", on_click=update_activity)
        except requests.exceptions.RequestException:
            st.error("Failed to fetch ledger.")
    if not st.session_state.reports:
        st.info("No reports found.")
        return
    # ==========================================
    #     NEW: SIMPLE LINE CHART WITH BIAS
    # ==========================================
    st.subheader("📈 Packing Performance Trend")
    # Process data for line chart
    reports = st.session_state.reports
    df_reports = pd.DataFrame(reports)
    if not df_reports.empty and 'date' in df_reports.columns and 'total_units' in df_reports.columns:
        # Convert date and group by date (sum if multiple entries per day)
        df_reports['date'] = pd.to_datetime(df_reports['date'])
        daily_totals = df_reports.groupby('date')['total_units'].sum().reset_index()
        daily_totals = daily_totals.sort_values('date')
        # Calculate trend bias
        if len(daily_totals) >= 14:
            # Compare last 7 days vs previous 7 days
            recent_avg = daily_totals['total_units'].tail(7).mean()
            previous_avg = daily_totals['total_units'].tail(14).head(7).mean()
            if recent_avg > previous_avg * 1.05:  # 5% threshold
                bias = "🟢 BULLISH"
                bias_color = "#26a69a"
                bias_message = f"Upward trend (+{((recent_avg/previous_avg - 1) * 100):.1f}% vs last week)"
            elif recent_avg < previous_avg * 0.95:  # 5% threshold
                bias = "🔴 BEARISH"
                bias_color = "#ef5350"
                bias_message = f"Downward trend ({((recent_avg/previous_avg - 1) * 100):.1f}% vs last week)"
            else:
                bias = "🟡 NEUTRAL"
                bias_color = "#ffa726"
                bias_message = "Sideways movement (±5%)"
        else:
            bias = "⚪ INSUFFICIENT DATA"
            bias_color = "#78909c"
            bias_message = "Need at least 14 days of data"
            recent_avg = daily_totals['total_units'].mean() if not daily_totals.empty else 0
        # Create line chart
        fig = go.Figure()
        # Main trend line
        fig.add_trace(go.Scatter(
            x=daily_totals['date'],
            y=daily_totals['total_units'],
            mode='lines+markers',
            name='Daily Total',
            line=dict(color='#2962ff', width=2),
            marker=dict(size=6, color='#2962ff'),
            hovertemplate='<b>%{x|%d %b %Y}</b><br>Units: %{y:,.0f}<extra></extra>'
        ))
        # Add 7-day moving average line
        if len(daily_totals) >= 7:
            daily_totals['MA7'] = daily_totals['total_units'].rolling(window=7, min_periods=1).mean()
            fig.add_trace(go.Scatter(
                x=daily_totals['date'],
                y=daily_totals['MA7'],
                mode='lines',
                name='7-Day Average',
                line=dict(color=bias_color, width=2, dash='dash'),
                hovertemplate='<b>%{x|%d %b %Y}</b><br>Avg: %{y:,.0f}<extra></extra>'
            ))
        # Update layout
        fig.update_layout(
            title='Daily Packing Performance',
            yaxis_title='Total Units Packed',
            xaxis_title='Date',
            height=450,
            template='plotly_dark',
            hovermode='x unified',
            showlegend=True,
            legend=dict(
                orientation="h",
                yanchor="bottom",
                y=1.02,
                xanchor="right",
                x=1
            )
        )
        st.plotly_chart(fig, use_container_width=True, key="line_chart")
        # Show metrics with bias
        col1, col2, col3, col4 = st.columns(4)
        current_total = daily_totals['total_units'].iloc[-1] if not daily_totals.empty else 0
        peak_total = daily_totals['total_units'].max() if not daily_totals.empty else 0
        avg_total = daily_totals['total_units'].mean() if not daily_totals.empty else 0
        col1.metric("Current Day", f"{current_total:,.0f}")
        col2.metric("Peak Day", f"{peak_total:,.0f}")
        col3.metric("7-Day Avg", f"{recent_avg:,.0f}" if len(daily_totals) >= 7 else f"{avg_total:,.0f}")
        # --- FIX: Use valid delta_color values (color names instead of "up"/"down") ---
        col4.metric("Trend Bias", bias, delta=bias_message if bias != "⚪ INSUFFICIENT DATA" else None, 
                    delta_color="normal" if bias == "🟡 NEUTRAL" else ("green" if "🟢" in bias else "red"))
        # --------------------------------------------------------------------------------
    # ==========================================
    #     END OF LINE CHART WITH BIAS
    # ==========================================
    st.divider()
    st.subheader("📊 Daily Submissions")
    rep_rows = []
    for rep in st.session_state.reports:
        hwid = rep.get("hwid", "Unknown")
        rep_rows.append({"Date": rep.get("date", ""), "Operator / HWID": hwid, "Total Units Packed": rep.get("total_units", 0)})
    rep_df = pd.DataFrame(rep_rows)
    st.dataframe(rep_df, width="stretch", hide_index=True, key="df_reports")
    st.subheader("📦 Shift Breakdown Details")
    if not rep_df.empty:
        sel_idx = st.selectbox("Select Submission to view details", rep_df.index, format_func=lambda x: f"{rep_df.iloc[x]['Date']} - {rep_df.iloc[x]['Operator / HWID']}", key="select_report_details", on_change=update_activity)
        if sel_idx is not None:
            rep_data = st.session_state.reports[sel_idx].get("data", {})
            if rep_data:
                det_rows = sorted(rep_data.items(), key=lambda x: x[1], reverse=True)
                det_df = pd.DataFrame(det_rows, columns=["SKU Name", "Total Exported"])
                st.dataframe(det_df, width="stretch", hide_index=True, key="df_report_details")

# ==========================================
# TAB 10: LIVE OVERWATCH & WIRETAP
# ==========================================
def tab_overwatch():
    st.subheader("👁️ Live Overwatch & Wiretap")
    if not st.session_state.users:
        try:
            res = requests.get(f"{BASE_URL}/list_users", params={"admin_key": ADMIN_PASS})
            if res.status_code == 200: st.session_state.users = res.json()
        except requests.exceptions.RequestException:
            pass
    users = st.session_state.users
    options = {f"{u.get('alias', 'Unknown')} [{u.get('hwid')}]" : u.get('hwid') for u in users}
    c1, c2, c3 = st.columns([3, 1, 1])
    sel_label = c1.selectbox("Target Terminal", list(options.keys()), key="select_overwatch_target", on_change=update_activity)
    if c2.button("🔌 CONNECT", key="btn_connect_overwatch", on_click=update_activity):
        st.session_state.overwatch_hwid = options[sel_label]
        st.session_state.overwatch_logs = []
    if c3.button("🛑 DISCONNECT", key="btn_disconnect_overwatch", on_click=update_activity):
        st.session_state.overwatch_hwid = None
    if st.session_state.overwatch_hwid:
        st.write(f"**Connected to:** {sel_label}")
        @st.fragment(run_every=3)
        def terminal_feed():
            try:
                res = requests.get(f"{BASE_URL}/api/overwatch", params={"admin_key": ADMIN_PASS, "target_hwid": st.session_state.overwatch_hwid})
                if res.status_code == 200:
                    logs = res.json()
                    if len(logs) > len(st.session_state.overwatch_logs):
                        st.session_state.overwatch_logs = logs
            except requests.exceptions.RequestException:
                pass
            st.code("\n".join(st.session_state.overwatch_logs[-50:]), language="bash")
        terminal_feed()
        st.divider()
        st.subheader("📂 Intercepted Surat Jalan")
        if st.button("🔄 Refresh Files", key="btn_refresh_files", on_click=update_activity):
            try:
                res = requests.get(f"{BASE_URL}/api/intercept", params={"admin_key": ADMIN_PASS})
                if res.status_code == 200: st.session_state.intercepted_files = res.json()
            except requests.exceptions.RequestException:
                pass
        files = st.session_state.intercepted_files
        if files:
            for f in files:
                st.text(f)
            if st.button("📦 DOWNLOAD ALL AS ZIP", key="btn_download_zip", on_click=update_activity):
                try:
                    res = requests.get(f"{BASE_URL}/api/intercept/download_all", params={"admin_key": ADMIN_PASS})
                    if res.status_code == 200:
                        st.download_button("⬇️ Click to Save ZIP", res.content, file_name="intercepts_batch.zip", mime="application/zip", key="dl_zip", on_click=update_activity)
                except requests.exceptions.RequestException:
                    st.error("Failed to generate ZIP.")
        else:
            st.info("No intercepted files.")

# ==========================================
# TAB 11: AUDIT TRAIL (NEW)
# ==========================================
def tab_audit_trail():
    st.subheader("📜 Audit Trail & Security Logs")
    c1, c2 = st.columns([3, 1])
    with c1:
        if st.button("🔄 Refresh Logs", key="btn_refresh_audit", on_click=update_activity):
            if 'audit_logs' in st.session_state:
                del st.session_state.audit_logs
            st.rerun()
    if 'audit_logs' not in st.session_state:
        with st.spinner("Fetching audit logs..."):
            try:
                res = requests.get(f"{BASE_URL}/api/audit_logs", params={"admin_key": ADMIN_PASS}, timeout=10)
                if res.status_code == 200:
                    st.session_state.audit_logs = res.json()
                else:
                    st.error("Failed to fetch logs.")
                    st.session_state.audit_logs = []
            except requests.exceptions.RequestException:
                st.error("Network error fetching logs.")
                st.session_state.audit_logs = []
    logs = st.session_state.audit_logs
    if not logs:
        st.info("No audit logs found.")
        return
    df = pd.DataFrame(logs)
    # Filters
    st.write("**Filters:**")
    fc1, fc2, fc3 = st.columns(3)
    with fc1:
        users = ["All"]
        if "user" in df.columns:
            users.extend(sorted([u for u in df["user"].dropna().unique().tolist() if u]))
        sel_user = st.selectbox("User", users, key="filter_user", on_change=update_activity)
    with fc2:
        actions = ["All"]
        if "action_type" in df.columns:
            actions.extend(sorted([a for a in df["action_type"].dropna().unique().tolist() if a]))
        sel_action = st.selectbox("Action Type", actions, key="filter_action", on_change=update_activity)
    with fc3:
        st.write("") # Spacer to align filters
    # Apply filters
    filtered_df = df.copy()
    if sel_user != "All":
        filtered_df = filtered_df[filtered_df["user"] == sel_user]
    if sel_action != "All":
        filtered_df = filtered_df[filtered_df["action_type"] == sel_action]
    # Display
    display_cols = ["timestamp", "user", "role", "action_type", "details"]
    display_cols = [c for c in display_cols if c in filtered_df.columns]
    st.dataframe(filtered_df[display_cols], width="stretch", hide_index=True, key="df_audit")
    # Export
    if not filtered_df.empty:
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            filtered_df[display_cols].to_excel(writer, index=False)
        # --- NEW: ROLE-BASED EXPORT RESTRICTION ---
        if current_user in ["Admin", "JendralVittoria"]:
            st.download_button("📥 Export Audit Logs to Excel", output.getvalue(), "audit_logs.xlsx", key="dl_audit", on_click=update_activity)
        else:
            st.info("🔒 Export restricted to Admin/Manager roles")
        # -------------------------------------------

# ==========================================
# TAB 12: STAFF & OT MANAGEMENT (NEW)
# ==========================================
def tab_staff_ot():
    st.subheader("👥 Staff & Overtime Management")
    # Create sub-tabs
    subtab1, subtab2, subtab3, subtab4 = st.tabs(["📝 Daily Log", "📊 Monthly Summary", "👥 Roster", "🏆 Performance"])
    # ==========================================
    #     SUB-TAB 1: DAILY LOG
    # ==========================================
    with subtab1:
        st.markdown("### 📝 Daily Overtime Log")
        # Date picker
        selected_date = st.date_input("Select Date", value=datetime.date.today(), key="staff_ot_date")
        date_str = selected_date.strftime("%Y-%m-%d")
        # Fetch staff roster
        try:
            res = requests.get(f"{BASE_URL}/api/staff_roster", params={"admin_key": ADMIN_PASS})
            if res.status_code == 200:
                roster = res.json()
            else:
                roster = {}
        except requests.exceptions.RequestException:
            roster = {}
            st.error("Failed to fetch staff roster.")
        if not roster:
            st.warning("No staff members found. Please add staff in the Roster tab first.")
        else:
            # Fetch existing logs for this date
            try:
                res = requests.get(f"{BASE_URL}/api/staff_ot_logs", params={"admin_key": ADMIN_PASS, "date": date_str})
                if res.status_code == 200:
                    existing_logs = res.json()
                else:
                    existing_logs = []
            except requests.exceptions.RequestException:
                existing_logs = []
            # Build editable table
            rows = []
            for staff_id, staff_info in roster.items():
                if staff_info.get("status", "Active") == "Active":
                    # Find existing log for this staff
                    existing_entry = next((log for log in existing_logs if log.get("staff_id") == staff_id), None)
                    rows.append({
                        "Staff ID": staff_id,
                        "Name": staff_info.get("name", "Unknown"),
                        "Role": staff_info.get("role", "Packer"),
                        "OT Hours": existing_entry.get("ot_hours", 0) if existing_entry else 0,
                        "Note": existing_entry.get("note", "") if existing_entry else ""
                    })
            if rows:
                df = pd.DataFrame(rows)
                # Editable table
                edited_df = st.data_editor(
                    df,
                    column_config={
                        "Staff ID": st.column_config.TextColumn("Staff ID", disabled=True),
                        "Name": st.column_config.TextColumn("Name", disabled=True),
                        "Role": st.column_config.TextColumn("Role", disabled=True),
                        "OT Hours": st.column_config.NumberColumn("OT Hours", min_value=0, max_value=24, step=0.5, format="%.1f"),
                        "Note": st.column_config.TextColumn("Note (Optional)")
                    },
                    disabled=["Staff ID", "Name", "Role"],
                    hide_index=True,
                    use_container_width=True,
                    key="staff_ot_editor"
                )
                # Calculate totals
                total_ot = edited_df["OT Hours"].sum()
                total_cost = total_ot * 20000
                st.divider()
                col1, col2 = st.columns(2)
                col1.metric("💰 Total OT Hours", f"{total_ot:.1f} hrs")
                col2.metric("💵 Estimated Cost", f"Rp {total_cost:,.0f}")
                # Save button
                if st.button("💾 Save Daily Log", type="primary", use_container_width=True):
                    # Prepare payload
                    logs_payload = []
                    for _, row in edited_df.iterrows():
                        logs_payload.append({
                            "staff_id": row["Staff ID"],
                            "name": row["Name"],
                            "role": row["Role"],
                            "ot_hours": float(row["OT Hours"]),
                            "note": row["Note"]
                        })
                    try:
                        res = requests.post(
                            f"{BASE_URL}/api/staff_ot_logs",
                            json={
                                "admin_key": ADMIN_PASS,
                                "date": date_str,
                                "logs": logs_payload
                            }
                        )
                        if res.status_code == 200:
                            st.success(f"✅ Saved OT log for {date_str}")
                            log_audit("STAFF_OT_SAVE", f"Saved OT log for {date_str}: {total_ot:.1f} hrs, Rp {total_cost:,.0f}", user=current_user, role=user_role)
                            st.rerun()
                        else:
                            st.error(f"Failed to save: {res.text}")
                    except requests.exceptions.RequestException as e:
                        st.error(f"Network error: {e}")
    # ==========================================
    #     SUB-TAB 2: MONTHLY SUMMARY
    # ==========================================
    with subtab2:
        st.markdown("### 📊 Monthly OT Summary")
        # Month picker
        col1, col2 = st.columns([2, 1])
        with col1:
            selected_month = st.date_input("Select Month", value=datetime.date.today(), key="staff_ot_month")
            month_str = selected_month.strftime("%Y-%m")
        # Fetch monthly logs
        try:
            res = requests.get(f"{BASE_URL}/api/staff_ot_logs", params={"admin_key": ADMIN_PASS, "month": month_str})
            if res.status_code == 200:
                monthly_logs = res.json()
            else:
                monthly_logs = {}
        except requests.exceptions.RequestException:
            monthly_logs = {}
            st.error("Failed to fetch monthly logs.")
        if not monthly_logs:
            st.info(f"No OT logs found for {month_str}.")
        else:
            # Aggregate by staff member
            staff_summary = {}
            for date_key, daily_logs in monthly_logs.items():
                for log in daily_logs:
                    staff_id = log.get("staff_id")
                    if staff_id not in staff_summary:
                        staff_summary[staff_id] = {
                            "name": log.get("name", "Unknown"),
                            "role": log.get("role", "Packer"),
                            "total_hours": 0,
                            "days_worked": 0,
                            "total_cost": 0
                        }
                    staff_summary[staff_id]["total_hours"] += log.get("ot_hours", 0)
                    staff_summary[staff_id]["total_cost"] += log.get("cost", 0)
                    if log.get("ot_hours", 0) > 0:
                        staff_summary[staff_id]["days_worked"] += 1
            # Build summary table
            summary_rows = []
            for staff_id, data in staff_summary.items():
                summary_rows.append({
                    "Staff ID": staff_id,
                    "Name": data["name"],
                    "Role": data["role"],
                    "Days with OT": data["days_worked"],
                    "Total OT Hours": data["total_hours"],
                    "Total Cost (Rp)": data["total_cost"]
                })
            if summary_rows:
                summary_df = pd.DataFrame(summary_rows)
                summary_df = summary_df.sort_values("Total OT Hours", ascending=False)
                st.dataframe(summary_df, hide_index=True, use_container_width=True)
                # Totals
                total_hours = summary_df["Total OT Hours"].sum()
                total_cost = summary_df["Total Cost (Rp)"].sum()
                st.divider()
                col1, col2 = st.columns(2)
                col1.metric("💰 Total OT Hours (Month)", f"{total_hours:.1f} hrs")
                col2.metric("💵 Total Cost (Month)", f"Rp {total_cost:,.0f}")
                # Export to Excel
                output = io.BytesIO()
                with pd.ExcelWriter(output, engine='openpyxl') as writer:
                    summary_df.to_excel(writer, index=False, sheet_name="OT Summary")
                st.download_button(
                    "📥 Export to Excel",
                    output.getvalue(),
                    f"ot_summary_{month_str}.xlsx",
                    key="dl_ot_summary"
                )
    # ==========================================
    #     SUB-TAB 3: ROSTER MANAGEMENT
    # ==========================================
    with subtab3:
        st.markdown("### 👥 Staff Roster Management")
        # Fetch current roster
        try:
            res = requests.get(f"{BASE_URL}/api/staff_roster", params={"admin_key": ADMIN_PASS})
            if res.status_code == 200:
                roster = res.json()
            else:
                roster = {}
        except requests.exceptions.RequestException:
            roster = {}
            st.error("Failed to fetch staff roster.")
        # Display current roster
        if roster:
            roster_rows = []
            for staff_id, staff_info in roster.items():
                roster_rows.append({
                    "Staff ID": staff_id,
                    "Name": staff_info.get("name", "Unknown"),
                    "Role": staff_info.get("role", "Packer"),
                    "Status": staff_info.get("status", "Active"),
                    "Join Date": staff_info.get("join_date", "N/A")
                })
            roster_df = pd.DataFrame(roster_rows)
            st.dataframe(roster_df, hide_index=True, use_container_width=True)
        else:
            st.info("No staff members in roster yet.")
        st.divider()
        st.markdown("#### ➕ Add New Staff Member")
        with st.form("add_staff_form"):
            col1, col2, col3 = st.columns(3)
            with col1:
                new_staff_id = st.text_input("Staff ID (e.g., P001)", key="new_staff_id")
            with col2:
                new_staff_name = st.text_input("Name", key="new_staff_name")
            with col3:
                # --- UPDATED: New staff roles ---
                new_staff_role = st.selectbox("Role", ["Packer", "Helper", "Stock Keeper", "Checker", "DC Leader", "DC Supervisor"], key="new_staff_role")
                # --------------------------------
            submitted = st.form_submit_button("➕ Add Staff", type="primary")
            if submitted:
                if not new_staff_id or not new_staff_name:
                    st.error("Staff ID and Name are required.")
                else:
                    try:
                        res = requests.post(
                            f"{BASE_URL}/api/staff_roster",
                            json={
                                "admin_key": ADMIN_PASS,
                                "staff_id": new_staff_id,
                                "name": new_staff_name,
                                "role": new_staff_role,
                                "status": "Active",
                                "join_date": datetime.date.today().strftime("%Y-%m-%d")
                            }
                        )
                        if res.status_code == 200:
                            st.success(f"✅ Added {new_staff_name} ({new_staff_id})")
                            log_audit("STAFF_ADD", f"Added staff: {new_staff_name} ({new_staff_id})", user=current_user, role=user_role)
                            st.rerun()
                        else:
                            st.error(f"Failed to add: {res.text}")
                    except requests.exceptions.RequestException as e:
                        st.error(f"Network error: {e}")
        # Delete staff
        if roster:
            st.divider()
            st.markdown("#### 🗑️ Remove Staff Member")
            staff_to_delete = st.selectbox("Select Staff to Remove", list(roster.keys()), format_func=lambda x: f"{x} - {roster[x].get('name', 'Unknown')}", key="delete_staff_select")
            if st.button("🗑️ Remove Selected Staff", type="secondary"):
                try:
                    res = requests.delete(
                        f"{BASE_URL}/api/staff_roster/{staff_to_delete}",
                        params={"admin_key": ADMIN_PASS}
                    )
                    if res.status_code == 200:
                        st.success(f"✅ Removed {staff_to_delete}")
                        log_audit("STAFF_DELETE", f"Removed staff: {staff_to_delete}", user=current_user, role=user_role)
                        st.rerun()
                    else:
                        st.error(f"Failed to remove: {res.text}")
                except requests.exceptions.RequestException as e:
                    st.error(f"Network error: {e}")
    # ==========================================
    #     SUB-TAB 4: PERFORMANCE TRACKER (NEW)
    # ==========================================
    with subtab4:
        st.subheader("🏆 Staff Performance Tracker")
        # Create sub-sub-tabs
        perf_tab1, perf_tab2, perf_tab3 = st.tabs(["📊 Dashboard", "➕ Score Week", "👁️ Staff History"])
        # --- SUB-TAB 1: DASHBOARD ---
        with perf_tab1:
            st.markdown("### 📊 Performance Leaderboard")
            # Fetch all performance data
            try:
                res = requests.get(f"{BASE_URL}/api/staff/performance", params={"admin_key": ADMIN_PASS})
                if res.status_code == 200:
                    perf_data = res.json()
                    st.session_state.perf_scores = perf_data.get("scores", {})
                else:
                    perf_data = {}
                    st.session_state.perf_scores = {}
            except requests.exceptions.RequestException:
                st.error("Failed to fetch performance data.")
                perf_data = {}
                st.session_state.perf_scores = {}
            # Calculate leaderboard data
            leaderboard = []
            roster = {}
            try:
                res = requests.get(f"{BASE_URL}/api/staff_roster", params={"admin_key": ADMIN_PASS})
                if res.status_code == 200:
                    roster = res.json()
            except:
                pass
            # Get latest week scores
            latest_week = None
            if st.session_state.perf_scores:
                weeks = sorted(st.session_state.perf_scores.keys(), reverse=True)
                if weeks:
                    latest_week = weeks[0]
            if latest_week and latest_week in st.session_state.perf_scores:
                for staff_id, score_data in st.session_state.perf_scores[latest_week].items():
                    name = score_data.get("name", "Unknown")
                    role = score_data.get("role", "Unknown")
                    total = score_data.get("total", 0)
                    # Calculate 4-week rolling average
                    last_4 = []
                    for week in sorted(st.session_state.perf_scores.keys(), reverse=True)[:4]:
                        if staff_id in st.session_state.perf_scores[week]:
                            last_4.append(st.session_state.perf_scores[week][staff_id].get("total", 0))
                    avg_4w = round(sum(last_4) / len(last_4), 1) if last_4 else None
                    # Determine status
                    if avg_4w and avg_4w >= 16.0:
                        status = "🚀 Ready"
                    elif avg_4w and avg_4w <= 12.0:
                        status = "⚠️ Coaching"
                    else:
                        status = "✅ Steady"
                    leaderboard.append({
                        "Name": name,
                        "Role": role,
                        "This Week": f"{total}/20",
                        "4-Week Avg": f"{avg_4w}/20" if avg_4w else "-",
                        "Status": status
                    })
            if leaderboard:
                df = pd.DataFrame(leaderboard)
                df = df.sort_values("4-Week Avg", ascending=False, key=lambda x: x.str.replace('/20', '').astype(float) if x.name == "4-Week Avg" else x)
                st.dataframe(df, hide_index=True, use_container_width=True)
                # Auto-flags
                st.divider()
                st.markdown("### 🚨 Auto-Flagged for Review")
                flagged = [l for l in leaderboard if l["Status"] in ["🚀 Ready", "⚠️ Coaching"]]
                if flagged:
                    for f in flagged:
                        if f["Status"] == "🚀 Ready":
                            st.success(f"• **{f['Name']}**: Promotion Ready (4-week avg: {f['4-Week Avg']})")
                        else:
                            st.warning(f"• **{f['Name']}**: Needs Coaching (4-week avg: {f['4-Week Avg']})")
                else:
                    st.info("No staff flagged for review this week.")
            else:
                st.info("No performance scores recorded yet.")
            # Export button
            st.divider()
            if st.button("📥 Export Full Report for HR", key="btn_export_perf_hr"):
                # Generate Excel with chart (simplified version)
                output = io.BytesIO()
                with pd.ExcelWriter(output, engine='openpyxl') as writer:
                    if leaderboard:
                        df_export = pd.DataFrame(leaderboard)
                        df_export.to_excel(writer, sheet_name="Summary", index=False)
                st.download_button("⬇️ Download Performance Report", output.getvalue(), "staff_performance_report.xlsx", key="dl_perf_export")
        # --- SUB-TAB 2: SCORE WEEK ---
        with perf_tab2:
            st.markdown("### ➕ Weekly Performance Scoring")
            # Fetch roster for staff selection
            try:
                res = requests.get(f"{BASE_URL}/api/staff_roster", params={"admin_key": ADMIN_PASS})
                if res.status_code == 200:
                    roster = res.json()
                else:
                    roster = {}
            except requests.exceptions.RequestException:
                roster = {}
                st.error("Failed to fetch staff roster.")
            if not roster:
                st.warning("No staff members found. Please add staff in the Roster tab first.")
            else:
                # Week selector
                current_week = datetime.datetime.now().strftime("%Y-W%W")
                week_options = [current_week] + [f"{datetime.datetime.now().year}-W{w:02d}" for w in range(1, 53)]
                selected_week = st.selectbox("Select Week", week_options, index=0, key="perf_week_select")
                # Staff selector
                staff_options = {f"{info['name']} ({info['role']})": sid for sid, info in roster.items()}
                selected_label = st.selectbox("Select Staff Member", list(staff_options.keys()), key="perf_staff_select")
                selected_staff_id = staff_options[selected_label]
                # Fetch existing score for this week (if any)
                existing_score = None
                if selected_week in st.session_state.perf_scores and selected_staff_id in st.session_state.perf_scores[selected_week]:
                    existing_score = st.session_state.perf_scores[selected_week][selected_staff_id]
                # KPI scoring form
                with st.form("perf_score_form"):
                    st.markdown("#### Rate Each KPI (1 = Poor, 5 = Excellent)")
                    # Kedisiplinan
                    st.markdown("**🕐 Kedisiplinan** (Punctuality, Attendance, Rules)")
                    kedisiplinan = st.radio("Score", [1, 2, 3, 4, 5], index=(existing_score.get("kedisiplinan", 3) - 1) if existing_score else 2, horizontal=True, key="kedisiplinan_radio")
                    kedisiplinan_note = st.text_input("Notes", value=existing_score.get("notes", "") if existing_score and existing_score.get("kedisiplinan") == kedisiplinan else "", key="kedisiplinan_note")
                    # Inisiatif
                    st.markdown("**💡 Inisiatif** (Proactivity, Problem Solving)")
                    inisiatif = st.radio("Score", [1, 2, 3, 4, 5], index=(existing_score.get("inisiatif", 3) - 1) if existing_score else 2, horizontal=True, key="inisiatif_radio")
                    inisiatif_note = st.text_input("Notes", value=existing_score.get("notes", "") if existing_score and existing_score.get("inisiatif") == inisiatif else "", key="inisiatif_note")
                    # Kerja Sama Tim
                    st.markdown("**🤝 Kerja Sama Tim** (Teamwork, Communication)")
                    kerjasama = st.radio("Score", [1, 2, 3, 4, 5], index=(existing_score.get("kerjasama_tim", 3) - 1) if existing_score else 2, horizontal=True, key="kerjasama_radio")
                    kerjasama_note = st.text_input("Notes", value=existing_score.get("notes", "") if existing_score and existing_score.get("kerjasama_tim") == kerjasama else "", key="kerjasama_note")
                    # Pemeliharaan Alat
                    st.markdown("**🔧 Pemeliharaan Alat** (Equipment Care, Cleanliness)")
                    pemeliharaan = st.radio("Score", [1, 2, 3, 4, 5], index=(existing_score.get("pemeliharaan_alat", 3) - 1) if existing_score else 2, horizontal=True, key="pemeliharaan_radio")
                    pemeliharaan_note = st.text_input("Notes", value=existing_score.get("notes", "") if existing_score and existing_score.get("pemeliharaan_alat") == pemeliharaan else "", key="pemeliharaan_note")
                    # Combined notes field
                    all_notes = st.text_area("Overall Notes", value=existing_score.get("notes", "") if existing_score else "", key="perf_notes")
                    # Score summary
                    total = kedisiplinan + inisiatif + kerjasama + pemeliharaan
                    st.markdown(f"**📊 Score Summary:** {total} / 20 ({total/20*100:.0f}%)")
                    # Calculate rolling avg preview
                    last_4 = []
                    for week in sorted(st.session_state.perf_scores.keys(), reverse=True)[:4]:
                        if selected_staff_id in st.session_state.perf_scores[week]:
                            last_4.append(st.session_state.perf_scores[week][selected_staff_id].get("total", 0))
                    if len(last_4) == 4:
                        last_4[-1] = total  # Replace latest with new score for preview
                    elif len(last_4) < 4:
                        last_4.append(total)
                    avg_preview = round(sum(last_4) / len(last_4), 1)
                    st.markdown(f"**🎯 4-Week Avg Preview:** {avg_preview} / 20")
                    if avg_preview >= 16.0:
                        st.success("🚀 This would trigger a **Promotion Ready** recommendation")
                    elif avg_preview <= 12.0:
                        st.warning("⚠️ This would trigger a **Needs Coaching** recommendation")
                    submitted = st.form_submit_button("💾 Save Score", type="primary")
                    if submitted:
                        try:
                            staff_info = roster.get(selected_staff_id, {})
                            payload = {
                                "admin_key": ADMIN_PASS,
                                "staff_id": selected_staff_id,
                                "name": staff_info.get("name", "Unknown"),
                                "role": staff_info.get("role", "Unknown"),
                                "week": selected_week,
                                "kedisiplinan": kedisiplinan,
                                "inisiatif": inisiatif,
                                "kerjasama_tim": kerjasama,
                                "pemeliharaan_alat": pemeliharaan,
                                "notes": all_notes,
                                "scored_by": current_user
                            }
                            res = requests.post(f"{BASE_URL}/api/staff/performance", json=payload)
                            if res.status_code == 200:
                                st.success(f"✅ Score saved for {staff_info.get('name')}!")
                                log_audit("PERFORMANCE_SCORE", f"Scored {staff_info.get('name')} ({selected_staff_id}) for {selected_week}: {total}/20", user=current_user, role=user_role)
                                # Refresh scores
                                res = requests.get(f"{BASE_URL}/api/staff/performance", params={"admin_key": ADMIN_PASS})
                                if res.status_code == 200:
                                    st.session_state.perf_scores = res.json().get("scores", {})
                                st.rerun()
                            else:
                                st.error(f"Failed to save: {res.text}")
                        except requests.exceptions.RequestException as e:
                            st.error(f"Network error: {e}")
        # --- SUB-TAB 3: STAFF HISTORY ---
        with perf_tab3:
            st.markdown("### 👁️ Staff Performance History")
            # Staff selector
            try:
                res = requests.get(f"{BASE_URL}/api/staff_roster", params={"admin_key": ADMIN_PASS})
                if res.status_code == 200:
                    roster = res.json()
                else:
                    roster = {}
            except:
                roster = {}
            if roster:
                staff_options = {f"{info['name']} ({info['role']})": sid for sid, info in roster.items()}
                selected_label = st.selectbox("Select Staff Member", list(staff_options.keys()), key="perf_history_select")
                selected_staff_id = staff_options[selected_label]
                # Fetch trend data
                try:
                    res = requests.get(f"{BASE_URL}/api/staff/performance/trend", params={"admin_key": ADMIN_PASS, "staff_id": selected_staff_id})
                    if res.status_code == 200:
                        trend_data = res.json()
                        trend = trend_data.get("trend", [])
                        rolling_avg = trend_data.get("rolling_avg_4w")
                    else:
                        trend = []
                        rolling_avg = None
                except:
                    trend = []
                    rolling_avg = None
                if trend:
                    # Display summary
                    staff_info = roster.get(selected_staff_id, {})
                    st.markdown(f"**{staff_info.get('name')}** - {staff_info.get('role')}")
                    st.markdown(f"4-Week Avg: **{rolling_avg}/20**" if rolling_avg else "4-Week Avg: **N/A**")
                    # Trend chart
                    if len(trend) >= 4:
                        weeks = [t["week"] for t in trend]
                        scores = [t["total"] for t in trend]
                        fig = go.Figure()
                        fig.add_trace(go.Scatter(
                            x=weeks,
                            y=scores,
                            mode='lines+markers',
                            name='Weekly Score',
                            line=dict(color='#2962ff', width=2)
                        ))
                        # Add threshold line at 16.0
                        fig.add_hline(y=16.0, line_dash="dash", line_color="green", annotation_text="Promotion Threshold")
                        fig.update_layout(
                            title='Performance Trend',
                            yaxis_title='Score (4-20)',
                            xaxis_title='Week',
                            height=300,
                            template='plotly_white'
                        )
                        st.plotly_chart(fig, use_container_width=True)
                    # Weekly details table
                    st.markdown("#### Weekly Breakdown")
                    detail_rows = []
                    for t in trend:
                        detail_rows.append({
                            "Week": t["week"],
                            "K1": t["kedisiplinan"],
                            "K2": t["inisiatif"],
                            "K3": t["kerjasama_tim"],
                            "K4": t["pemeliharaan_alat"],
                            "Total": t["total"],
                            "Notes": t.get("notes", "")
                        })
                    detail_df = pd.DataFrame(detail_rows)
                    st.dataframe(detail_df, hide_index=True, use_container_width=True)
                    # Export button
                    st.divider()
                    if st.button("📥 Export This Staff Report", key=f"btn_export_{selected_staff_id}"):
                        # Generate Excel with chart (simplified)
                        output = io.BytesIO()
                        with pd.ExcelWriter(output, engine='openpyxl') as writer:
                            # Summary sheet
                            summary_data = {
                                "Staff Name": [staff_info.get("name")],
                                "Role": [staff_info.get("role")],
                                "4-Week Avg": [rolling_avg],
                                "Status": ["🚀 Ready" if rolling_avg and rolling_avg >= 16.0 else "⚠️ Coaching" if rolling_avg and rolling_avg <= 12.0 else "✅ Steady"]
                            }
                            pd.DataFrame(summary_data).to_excel(writer, sheet_name="Summary", index=False)
                            # Details sheet
                            detail_df.to_excel(writer, sheet_name="Weekly Details", index=False)
                        filename = f"{staff_info.get('name', 'Staff')}_Performance_Report.xlsx"
                        st.download_button("⬇️ Download Report", output.getvalue(), filename, key=f"dl_export_{selected_staff_id}")
                else:
                    st.info("No performance history found for this staff member.")
            else:
                st.info("No staff members found.")

# ==========================================
# TAB 13: TSA DISCREPANCY TRACKER (IMPROVED)
# ==========================================
def tab_tsa_tracker():
    st.subheader("🎯 TSA Discrepancy & Custody Tracker")
    # Create sub-tabs (4 tabs now)
    subtab1, subtab2, subtab3, subtab4 = st.tabs(["📋 Cases", "➕ New Case", "📦 Goods in Custody", "📊 Analytics"])
    # ==========================================
    #     SUB-TAB 1: CASES DASHBOARD
    # ==========================================
    with subtab1:
        st.markdown("### 📋 Active Discrepancy Cases")
        # Fetch all cases
        try:
            res = requests.get(f"{BASE_URL}/api/tsa/cases", params={"admin_key": ADMIN_PASS})
            if res.status_code == 200:
                cases = res.json()
                st.session_state.tsa_cases = cases
            else:
                cases = []
        except requests.exceptions.RequestException:
            cases = []
            st.error("Failed to fetch TSA cases.")
        # Calculate stats
        open_cases = [c for c in cases if c.get("status") == "OPEN"]
        investigating_cases = [c for c in cases if c.get("status") == "INVESTIGATING"]
        done_cases = [c for c in cases if c.get("status") == "DONE"]
        # Display stats
        col1, col2, col3, col4 = st.columns(4)
        col1.metric("🔴 Open", len(open_cases))
        col2.metric("🟡 Investigating", len(investigating_cases))
        col3.metric("✅ Done", len(done_cases))
        col4.metric("📊 Total Cases", len(cases))
        st.divider()
        # Display cases table
        if cases:
            # Build table data
            table_rows = []
            for c in cases:
                status_emoji = "🔴" if c.get("status") == "OPEN" else ("🟡" if c.get("status") == "INVESTIGATING" else "✅")
                items_count = len(c.get("items", []))
                table_rows.append({
                    "ID": c.get("id", ""),
                    "Outlet": c.get("outlet", "Unknown"),
                    "Type": "Kurang Kirim" if c.get("issue_type") == "KURANG" else "Lebih Kirim",
                    "Items": items_count,
                    "Status": f"{status_emoji} {c.get('status', '')}",
                    "Reporter": c.get("reporter", "Unknown"),
                    "Created": c.get("created_at", "")[:10]
                })
            df = pd.DataFrame(table_rows)
            st.dataframe(df, hide_index=True, use_container_width=True)
            # Case detail selector
            st.divider()
            st.markdown("#### 🔍 View Case Details")
            case_options = {c.get("id"): c for c in cases}
            selected_case_id = st.selectbox(
                "Select Case",
                list(case_options.keys()),
                format_func=lambda x: f"{x} - {case_options[x].get('outlet', 'Unknown')} - {case_options[x].get('status', '')}"
            )
            if selected_case_id:
                case = case_options[selected_case_id]
                st.markdown(f"### Case {case.get('id')}")
                # Case info
                info_col1, info_col2 = st.columns(2)
                with info_col1:
                    st.write(f"**Outlet:** {case.get('outlet')}")
                    st.write(f"**Type:** {'Kurang Kirim' if case.get('issue_type') == 'KURANG' else 'Lebih Kirim'}")
                    st.write(f"**Reporter:** {case.get('reporter')}")
                with info_col2:
                    st.write(f"**Status:** {case.get('status')}")
                    st.write(f"**Created:** {case.get('created_at')}")
                    if case.get('delivery_no'):
                        st.write(f"**Delivery No:** {case.get('delivery_no')}")
                # Items
                st.markdown("#### 📦 Affected Items")
                items = case.get("items", [])
                if items:
                    items_df = pd.DataFrame(items)
                    st.dataframe(items_df, hide_index=True, use_container_width=True)
                # Notes
                if case.get("notes"):
                    st.markdown("#### 📝 Notes")
                    st.write(case.get("notes"))
                # Timeline
                st.markdown("#### 🕐 Investigation Timeline")
                timeline = case.get("timeline", [])
                for entry in timeline:
                    st.write(f"**{entry.get('timestamp')}** ({entry.get('user')}): {entry.get('action')}")
                # Update case
                st.divider()
                st.markdown("#### ⚙️ Update Case")
                new_status = st.selectbox(
                    "Change Status",
                    ["OPEN", "INVESTIGATING", "DONE"],
                    index=["OPEN", "INVESTIGATING", "DONE"].index(case.get("status", "OPEN"))
                )
                timeline_update = st.text_input("Add Timeline Note", placeholder="e.g., Checked CCTV, found missing boxes...")
                if st.button("💾 Update Case", type="primary"):
                    try:
                        payload = {
                            "admin_key": ADMIN_PASS,
                            "status": new_status,
                            "user": current_user
                        }
                        if timeline_update:
                            payload["timeline_entry"] = timeline_update
                        res = requests.put(
                            f"{BASE_URL}/api/tsa/cases/{selected_case_id}",
                            json=payload
                        )
                        if res.status_code == 200:
                            st.success("✅ Case updated successfully!")
                            log_audit("TSA_CASE_UPDATE", f"Updated case {selected_case_id}: status={new_status}", user=current_user, role=user_role)
                            st.rerun()
                        else:
                            st.error(f"Failed to update: {res.text}")
                    except requests.exceptions.RequestException as e:
                        st.error(f"Network error: {e}")
        else:
            st.info("No cases found. Create a new case in the 'New Case' tab.")
    # ==========================================
    #     SUB-TAB 2: NEW CASE (IMPROVED UI)
    # ==========================================
    with subtab2:
        st.markdown("### ➕ Report New Discrepancy")
        # Fetch master data for outlets and SKUs
        if st.session_state.master_data is None:
            try:
                res = requests.get(f"{BASE_URL}/api/master_data")
                if res.status_code == 200:
                    st.session_state.master_data = res.json()
            except:
                pass
        md = st.session_state.master_data or {}
        # Get outlet list
        outlet_list = list(md.get("OUTLET_INFO", {}).keys())
        # Get SKU list
        all_skus = []
        for skus in md.get("CATEGORIES", {}).values():
            all_skus.extend(skus)
        all_skus = sorted(list(set(all_skus)))
        with st.form("new_case_form"):
            # Reporter (Hardcoded)
            reporter = st.selectbox("Reported By", ["Khaifah", "Tari"], key="tsa_reporter")
            # Outlet
            outlet = st.selectbox("Affected Outlet", outlet_list if outlet_list else ["No outlets available"], key="tsa_outlet")
            # Delivery No (Optional)
            delivery_no = st.text_input("Delivery No (Optional)", key="tsa_delivery_no")
            # Issue Type
            issue_type = st.radio("Issue Type", ["KURANG", "LEBIH"], format_func=lambda x: "Kurang Kirim (Short)" if x == "KURANG" else "Lebih Kirim (Over)", key="tsa_issue_type")
            # Items - IMPROVED: Use data_editor instead of number_input loop
            st.markdown("#### 📦 Affected Items")
            # Start with one empty row
            default_items = pd.DataFrame({
                "SKU": [all_skus[0] if all_skus else ""],
                "DO_Qty": [0],
                "Actual_Qty": [0]
            })
            edited_items = st.data_editor(
                default_items,
                num_rows="dynamic",
                width="stretch",
                column_config={
                    "SKU": st.column_config.SelectboxColumn("SKU", options=all_skus, required=True),
                    "DO_Qty": st.column_config.NumberColumn("DO Qty", min_value=0, step=1, required=True),
                    "Actual_Qty": st.column_config.NumberColumn("Actual Qty", min_value=0, step=1, required=True)
                },
                key="case_items_editor",
                hide_index=True
            )
            # Calculate discrepancies for display
            if not edited_items.empty:
                edited_items["Discrepancy"] = edited_items["Actual_Qty"] - edited_items["DO_Qty"]
                st.dataframe(edited_items[["SKU", "DO_Qty", "Actual_Qty", "Discrepancy"]], hide_index=True, use_container_width=True)
            # Notes
            notes = st.text_area("Notes", placeholder="Additional details about the discrepancy...", key="tsa_notes")
            # Submit
            submitted = st.form_submit_button("📝 Submit Case", type="primary")
            if submitted:
                if outlet == "No outlets available":
                    st.error("No outlets available. Please check Master Data.")
                else:
                    # Convert edited dataframe to items list
                    items_data = []
                    for _, row in edited_items.iterrows():
                        if row["SKU"] and row["SKU"] != "":
                            items_data.append({
                                "sku": row["SKU"],
                                "do_qty": int(row["DO_Qty"]),
                                "actual_qty": int(row["Actual_Qty"]),
                                "discrepancy": int(row["Actual_Qty"] - row["DO_Qty"])
                            })
                    if not items_data:
                        st.error("Please add at least one item.")
                    else:
                        try:
                            payload = {
                                "admin_key": ADMIN_PASS,
                                "reporter": reporter,
                                "outlet": outlet,
                                "delivery_no": delivery_no,
                                "issue_type": issue_type,
                                "items": items_data,
                                "notes": notes
                            }
                            res = requests.post(
                                f"{BASE_URL}/api/tsa/cases",
                                json=payload
                            )
                            if res.status_code == 201:
                                case_id = res.json().get("case_id")
                                st.success(f"✅ Case {case_id} created successfully!")
                                log_audit("TSA_CASE_CREATE", f"Created case {case_id} for {outlet}", user=current_user, role=user_role)
                                st.rerun()
                            else:
                                st.error(f"Failed to create case: {res.text}")
                        except requests.exceptions.RequestException as e:
                            st.error(f"Network error: {e}")
    # ==========================================
    #     SUB-TAB 3: GOODS IN CUSTODY (NEW)
    # ==========================================
    with subtab3:
        st.markdown("### 📦 Goods in Custody (Leftovers)")
        # Fetch custody records
        try:
            res = requests.get(f"{BASE_URL}/api/tsa/custody", params={"admin_key": ADMIN_PASS})
            if res.status_code == 200:
                custody_records = res.json()
                st.session_state.tsa_custody_records = custody_records
            else:
                custody_records = []
        except requests.exceptions.RequestException:
            custody_records = []
            st.error("Failed to fetch custody records.")
        # Stats
        open_custody = [c for c in custody_records if c.get("status") == "OPEN"]
        assigned_custody = [c for c in custody_records if c.get("status") == "ASSIGNED"]
        cleared_custody = [c for c in custody_records if c.get("status") == "CLEARED"]
        col1, col2, col3 = st.columns(3)
        col1.metric("🔴 Open", len(open_custody))
        col2.metric("🟡 Assigned", len(assigned_custody))
        col3.metric("✅ Cleared", len(cleared_custody))
        st.divider()
        # Custody records table
        if custody_records:
            table_rows = []
            for c in custody_records:
                status_emoji = "🔴" if c.get("status") == "OPEN" else ("🟡" if c.get("status") == "ASSIGNED" else "✅")
                table_rows.append({
                    "ID": c.get("id", ""),
                    "Item": c.get("item_sku", "Unknown"),
                    "Qty": c.get("quantity", 0),
                    "Location": c.get("found_location", "Unknown"),
                    "Status": f"{status_emoji} {c.get('status', '')}",
                    "Reported By": c.get("reported_by", "Unknown"),
                    "Created": c.get("created_at", "")[:10]
                })
            df = pd.DataFrame(table_rows)
            st.dataframe(df, hide_index=True, use_container_width=True)
            # Detail view
            st.divider()
            st.markdown("#### 🔍 View Custody Details")
            custody_options = {c.get("id"): c for c in custody_records}
            selected_custody_id = st.selectbox(
                "Select Record",
                list(custody_options.keys()),
                format_func=lambda x: f"{x} - {custody_options[x].get('item_sku', 'Unknown')} - {custody_options[x].get('status', '')}"
            )
            if selected_custody_id:
                record = custody_options[selected_custody_id]
                st.markdown(f"### Custody Record {record.get('id')}")
                # Record info
                info_col1, info_col2 = st.columns(2)
                with info_col1:
                    st.write(f"**Item:** {record.get('item_sku')}")
                    st.write(f"**Quantity:** {record.get('quantity')}")
                    st.write(f"**Found Location:** {record.get('found_location')}")
                    st.write(f"**Reported By:** {record.get('reported_by')}")
                with info_col2:
                    st.write(f"**Status:** {record.get('status')}")
                    st.write(f"**Created:** {record.get('created_at')}")
                    if record.get('assigned_to_outlet'):
                        st.write(f"**Assigned To:** {record.get('assigned_to_outlet')}")
                # Notes
                if record.get("notes"):
                    st.markdown("#### 📝 Notes")
                    st.write(record.get("notes"))
                # Update record
                st.divider()
                st.markdown("#### ⚙️ Update Record")
                new_status = st.selectbox(
                    "Change Status",
                    ["OPEN", "ASSIGNED", "CLEARED"],
                    index=["OPEN", "ASSIGNED", "CLEARED"].index(record.get("status", "OPEN"))
                )
                assigned_outlet = None
                if new_status == "ASSIGNED":
                    # Fetch outlet list for assignment
                    outlet_list = list(md.get("OUTLET_INFO", {}).keys()) if md else []
                    assigned_outlet = st.selectbox("Assign to Outlet", [""] + outlet_list, key="assign_outlet_select")
                update_notes = st.text_input("Update Notes", placeholder="e.g., Assigned to BBT-ASTHA...", key="custody_update_notes")
                if st.button("💾 Update Record", type="primary"):
                    try:
                        payload = {
                            "admin_key": ADMIN_PASS,
                            "status": new_status
                        }
                        if assigned_outlet:
                            payload["assigned_to_outlet"] = assigned_outlet
                        if update_notes:
                            payload["notes"] = update_notes
                        res = requests.put(
                            f"{BASE_URL}/api/tsa/custody/{selected_custody_id}",
                            json=payload
                        )
                        if res.status_code == 200:
                            st.success("✅ Custody record updated successfully!")
                            log_audit("TSA_CUSTODY_UPDATE", f"Updated custody {selected_custody_id}: status={new_status}", user=current_user, role=user_role)
                            st.rerun()
                        else:
                            st.error(f"Failed to update: {res.text}")
                    except requests.exceptions.RequestException as e:
                        st.error(f"Network error: {e}")
        else:
            st.info("No custody records found.")
        # Log new custody item
        st.divider()
        st.markdown("#### ➕ Log New Custody Item")
        with st.form("log_custody_form"):
            c1, c2, c3 = st.columns(3)
            with c1:
                custody_sku = st.selectbox("Item SKU", all_skus if all_skus else ["No SKUs available"], key="custody_sku_select")
            with c2:
                custody_qty = st.number_input("Quantity", min_value=1, value=1, key="custody_qty_input")
            with c3:
                custody_location = st.text_input("Found Location", placeholder="e.g., Packing Zone B", key="custody_location_input")
            custody_reporter = st.selectbox("Reported By", ["Khaifah", "Tari", current_user], key="custody_reporter_select")
            custody_notes = st.text_area("Notes", placeholder="e.g., Found loose on floor during cleanup...", key="custody_notes_input")
            if st.form_submit_button("📦 Log as Goods in Custody", type="secondary"):
                if not custody_sku or not custody_location:
                    st.error("Please fill all required fields.")
                else:
                    try:
                        payload = {
                            "admin_key": ADMIN_PASS,
                            "item_sku": custody_sku,
                            "quantity": custody_qty,
                            "found_location": custody_location,
                            "reported_by": custody_reporter,
                            "notes": custody_notes
                        }
                        res = requests.post(
                            f"{BASE_URL}/api/tsa/custody",
                            json=payload
                        )
                        if res.status_code == 201:
                            custody_id = res.json().get("custody_id")
                            st.success(f"✅ Custody record {custody_id} created!")
                            log_audit("TSA_CUSTODY_CREATE", f"Logged custody item {custody_sku} ({custody_qty}) at {custody_location}", user=current_user, role=user_role)
                            st.rerun()
                        else:
                            st.error(f"Failed to log: {res.text}")
                    except requests.exceptions.RequestException as e:
                        st.error(f"Network error: {e}")
    # ==========================================
    #     SUB-TAB 4: ANALYTICS
    # ==========================================
    with subtab4:
        st.markdown("### 📊 TSA Analytics")
        # Fetch all cases
        cases = st.session_state.tsa_cases
        if not cases:
            try:
                res = requests.get(f"{BASE_URL}/api/tsa/cases", params={"admin_key": ADMIN_PASS})
                if res.status_code == 200:
                    cases = res.json()
            except:
                cases = []
        if not cases:
            st.info("No cases to analyze yet.")
        else:
            # Agent Performance
            st.markdown("#### 👥 Agent Performance")
            agent_stats = {}
            for c in cases:
                reporter = c.get("reporter", "Unknown")
                if reporter not in agent_stats:
                    agent_stats[reporter] = {"total": 0, "done": 0}
                agent_stats[reporter]["total"] += 1
                if c.get("status") == "DONE":
                    agent_stats[reporter]["done"] += 1
            agent_rows = []
            for agent, stats in agent_stats.items():
                agent_rows.append({
                    "Agent": agent,
                    "Total Cases": stats["total"],
                    "Resolved": stats["done"],
                    "Resolution Rate": f"{(stats['done']/stats['total']*100):.0f}%" if stats["total"] > 0 else "0%"
                })
            agent_df = pd.DataFrame(agent_rows)
            st.dataframe(agent_df, hide_index=True, use_container_width=True)
            st.divider()
            # Problematic Outlets
            st.markdown("#### 🏪 Problematic Outlets")
            outlet_stats = {}
            for c in cases:
                outlet = c.get("outlet", "Unknown")
                if outlet not in outlet_stats:
                    outlet_stats[outlet] = {"total": 0, "kurang": 0, "lebih": 0}
                outlet_stats[outlet]["total"] += 1
                if c.get("issue_type") == "KURANG":
                    outlet_stats[outlet]["kurang"] += 1
                else:
                    outlet_stats[outlet]["lebih"] += 1
            # Sort by total cases
            sorted_outlets = sorted(outlet_stats.items(), key=lambda x: x[1]["total"], reverse=True)[:10]
            outlet_rows = []
            for outlet, stats in sorted_outlets:
                outlet_rows.append({
                    "Outlet": outlet,
                    "Total Cases": stats["total"],
                    "Kurang Kirim": stats["kurang"],
                    "Lebih Kirim": stats["lebih"]
                })
            outlet_df = pd.DataFrame(outlet_rows)
            st.dataframe(outlet_df, hide_index=True, use_container_width=True)
            st.divider()
            # Problematic Items
            st.markdown("#### 📦 Problematic Items")
            item_stats = {}
            for c in cases:
                for item in c.get("items", []):
                    sku = item.get("sku", "Unknown")
                    if sku not in item_stats:
                        item_stats[sku] = {"total": 0, "kurang": 0, "lebih": 0}
                    item_stats[sku]["total"] += 1
                    if item.get("discrepancy", 0) < 0:
                        item_stats[sku]["kurang"] += 1
                    else:
                        item_stats[sku]["lebih"] += 1
            # Sort by total cases
            sorted_items = sorted(item_stats.items(), key=lambda x: x[1]["total"], reverse=True)[:10]
            item_rows = []
            for sku, stats in sorted_items:
                item_rows.append({
                    "SKU": sku,
                    "Total Cases": stats["total"],
                    "Kurang": stats["kurang"],
                    "Lebih": stats["lebih"]
                })
            item_df = pd.DataFrame(item_rows)
            st.dataframe(item_df, hide_index=True, use_container_width=True)

# ==========================================
# TAB 14: CHECKER MANAGEMENT (NEW)
# ==========================================
def tab_checker_management():
    st.subheader("👥 Checker Management")
    st.markdown("Manage the list of authorized checkers. Changes will be reflected in the Packing List App immediately upon 'Live Sync'.")
    
    # Fetch current checkers
    try:
        res = requests.get(f"{BASE_URL}/api/checkers", timeout=5)
        if res.status_code == 200:
            current_checkers = res.json().get("checkers", [])
        else:
            current_checkers = []
            st.error("Failed to fetch checkers from server.")
    except Exception as e:
        current_checkers = []
        st.error(f"Network error: {e}")

    if current_checkers:
        st.write("**Current Authorized Checkers:**")
        st.write(", ".join(current_checkers))
    else:
        st.info("No checkers configured yet.")

    st.divider()
    
    col1, col2 = st.columns([1, 2])
    with col1:
        st.markdown("### ➕ Add New Checker")
        new_checker = st.text_input("Checker Name", key="new_checker_name").strip()
        if st.button("Add Checker", key="btn_add_checker", on_click=update_activity):
            if new_checker and new_checker not in current_checkers:
                try:
                    res = requests.post(
                        f"{BASE_URL}/api/checkers",
                        json={"admin_key": ADMIN_PASS, "checker_name": new_checker},
                        timeout=5
                    )
                    if res.status_code == 200:
                        st.success(f"✅ Added '{new_checker}' successfully!")
                        log_audit("CHECKER_ADD", f"Added checker: {new_checker}", user=current_user, role=user_role)
                        st.rerun()
                    else:
                        st.error(f"Failed to add: {res.text}")
                except Exception as e:
                    st.error(f"Network error: {e}")
            elif new_checker in current_checkers:
                st.warning("Checker already exists.")
            else:
                st.error("Please enter a valid name.")

    with col2:
        st.markdown("### 🗑️ Remove Checker")
        if current_checkers:
            checker_to_remove = st.selectbox("Select Checker to Remove", current_checkers, key="select_remove_checker", on_change=update_activity)
            if st.button("Remove Selected", key="btn_remove_checker", on_click=update_activity):
                try:
                    res = requests.post(
                        f"{BASE_URL}/api/checkers",
                        json={"admin_key": ADMIN_PASS, "checker_name": checker_to_remove, "action": "remove"},
                        timeout=5
                    )
                    if res.status_code == 200:
                        st.success(f"✅ Removed '{checker_to_remove}' successfully!")
                        log_audit("CHECKER_REMOVE", f"Removed checker: {checker_to_remove}", user=current_user, role=user_role)
                        st.rerun()
                    else:
                        st.error(f"Failed to remove: {res.text}")
                except Exception as e:
                    st.error(f"Network error: {e}")
        else:
            st.info("No checkers to remove.")

# ==========================================
# MAIN APP ROUTER (DYNAMIC TABS)
# ==========================================
st.title("🛡️ JESTA COMMAND CENTER // v5.0 WEB EDITION")

# Tab Configuration Mapping (FIXED: Removed all trailing spaces)
TAB_CONFIG = {
    "Access Control": {"label": "🛡️ Access Control", "func": tab_access_control},
    "Master Data": {"label": "📦 Master Data", "func": tab_master_data},
    "Barcode": {"label": "🏷️ Barcode Translator", "func": tab_kode_barang},
    "Outlet": {"label": "🏪 Outlet Directory", "func": tab_outlets},
    "Stock": {"label": "🏢 Live Stock", "func": tab_stock},
    "Manifests": {"label": "🚛 Manifests", "func": tab_manifests},
    "Packing Board": {"label": "📡 Live Packing Board", "func": tab_packing_board},
    "Inbound Planner": {"label": "📅 Inbound Planner", "func": tab_inbound_planner},
    "Inbound Logs": {"label": "📥 Inbound Logs", "func": tab_inbound},
    "Analytics": {"label": "📊 Analytics", "func": tab_analytics},
    "Overwatch": {"label": "👁️ Overwatch", "func": tab_overwatch},
    "Audit Trail": {"label": "📜 Audit Trail", "func": tab_audit_trail},
    "Staff & OT": {"label": "👥 Staff & OT", "func": tab_staff_ot},
    "TSA Tracker": {"label": "🎯 TSA Tracker", "func": tab_tsa_tracker},
    "Checker Management": {"label": "👥 Checker Management", "func": tab_checker_management}
}

# Filter allowed tabs based on user role
allowed_tabs = [key for key in accessible_tabs if key in TAB_CONFIG]
tab_labels = [TAB_CONFIG[key]["label"] for key in allowed_tabs]

# Render tabs dynamically using st.tabs()
if tab_labels:
    tabs = st.tabs(tab_labels)
    for tab_obj, key in zip(tabs, allowed_tabs):
        with tab_obj:
            TAB_CONFIG[key]["func"]()
else:
    st.warning("No accessible tabs available for your role.")
