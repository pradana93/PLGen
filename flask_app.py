from flask import Flask, request, jsonify, send_from_directory, send_file
import os
import json
import shutil
import time
import threading # <-- NEW: For background email sending
import smtplib # <-- NEW: For email notifications
from email.message import EmailMessage # <-- NEW: For email notifications
from datetime import datetime, timedelta, timezone # <-- UPDATED: Added timezone
import zipfile
import io
import requests
import base64

app = Flask(__name__)
DB_FILE = "database.txt"
ADMIN_SECRET = "majesta93"

# ==========================================
#     WIB TIMEZONE HELPER (UTC+7)
# ==========================================
def get_wib_time():
    """Forces Python to return the current time in WIB (UTC+7)"""
    wib_timezone = timezone(timedelta(hours=7))
    return datetime.now(wib_timezone)
# ==========================================

# ==========================================
#     NEW: BULLETPROOF WALLET SYSTEM
# ==========================================
WALLET_FILE = "wallet.json"
SUBSCRIPTION_PRICES = {
    30: 100000,
    90: 270000,
    180: 518000,
    365: 912000
}

def get_wallet_data():
    """Bulletproof JSON reader. Never crashes, even if file is corrupted."""
    if os.path.exists(WALLET_FILE):
        try:
            with open(WALLET_FILE, 'r') as f:
                content = f.read().strip()
                if not content:
                    return {}
                return json.loads(content)
        except Exception:
            # If file is corrupted, delete it and return empty
            try: os.remove(WALLET_FILE)
            except: pass
            return {}
    return {}

def save_wallet_data(data):
    try:
        with open(WALLET_FILE, 'w') as f:
            json.dump(data, f, indent=4)
    except Exception:
        pass

@app.route('/api/wallet_info', methods=['GET'])
def get_wallet_info():
    hwid = request.args.get('hwid')
    if not hwid:
        return jsonify({"error": "Missing HWID"}), 400

    hwid_exists = False
    expiry = None

    try:
        if os.path.exists(DB_FILE):
            with open(DB_FILE, "r") as f:
                for line in f:
                    parts = line.strip().split(':')
                    if len(parts) >= 4 and parts[0] == hwid:
                        hwid_exists = True
                        expiry = parts[3]
                        break
    except Exception:
        pass

    wallet_data = get_wallet_data()
    balance = wallet_data.get(hwid, {}).get("balance", 0)

    if not hwid_exists:
        return jsonify({"status": "UNREGISTERED", "balance": 0, "expiry": None}), 200
    else:
        return jsonify({"status": "REGISTERED", "balance": balance, "expiry": expiry}), 200

@app.route('/api/register_trial', methods=['POST'])
def register_trial():
    data = request.get_json()
    if not data: return jsonify({"error": "No data"}), 400
    hwid = data.get('hwid')
    if not hwid: return jsonify({"error": "Missing HWID"}), 400

    try:
        if os.path.exists(DB_FILE):
            with open(DB_FILE, "r") as f:
                for line in f:
                    if line.strip().startswith(hwid + ":"):
                        return jsonify({"error": "HWID already registered"}), 409
    except Exception:
        pass

    expiry_date = (get_wib_time() + timedelta(days=3)).strftime("%Y%m%d") # <-- UPDATED
    new_entry = f"{hwid}:Trial-User:ACTIVE:{expiry_date}\n"

    try:
        with open(DB_FILE, "a") as f:
            f.write(new_entry)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    return jsonify({"status": "success", "expiry": expiry_date}), 200

@app.route('/api/extend_license', methods=['POST'])
def extend_license():
    data = request.get_json()
    if not data: return jsonify({"error": "No data"}), 400
    hwid = data.get('hwid')
    try: days = int(data.get('days', 0))
    except: return jsonify({"error": "Invalid days"}), 400

    if days not in SUBSCRIPTION_PRICES:
        return jsonify({"error": "Invalid plan"}), 400

    price = SUBSCRIPTION_PRICES[days]
    wallet_data = get_wallet_data()

    if hwid not in wallet_data or wallet_data[hwid].get("balance", 0) < price:
        return jsonify({"error": "Insufficient Balance"}), 400

    wallet_data[hwid]["balance"] -= price
    save_wallet_data(wallet_data)

    expiry_date = (get_wib_time() + timedelta(days=days)).strftime("%Y%m%d") # <-- UPDATED
    new_entry = f"{hwid}:Auto-Paid-Via-QRIS:ACTIVE:{expiry_date}\n"

    lines = []
    found = False

    try:
        if os.path.exists(DB_FILE):
            with open(DB_FILE, "r") as f:
                for line in f:
                    if line.strip().startswith(hwid + ":"):
                        lines.append(new_entry)
                        found = True
                    else:
                        lines.append(line)

        if not found:
            lines.append(new_entry)

        with open(DB_FILE, "w") as f:
            f.writelines(lines)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    return jsonify({"status": "success", "new_balance": wallet_data[hwid]["balance"]}), 200

@app.route('/api/topup_request', methods=['POST'])
def topup_request():
    data = request.get_json()
    if not data: return jsonify({"error": "No data"}), 400
    hwid = data.get('hwid')
    try: amount = int(data.get('amount', 0))
    except: return jsonify({"error": "Invalid amount"}), 400

    if amount < 10000:
        return jsonify({"error": "Minimum topup is Rp 10.000"}), 400

    order_id = f"TOPUP-{hwid}-{int(time.time())}"

    # --- NEW: Extract Customer Details from App ---
    customer_name = data.get('customer_name', 'Warehouse User')
    customer_email = data.get('customer_email', '')

    # ⚠️ IMPORTANT: REPLACE THIS WITH YOUR ACTUAL MIDTRANS SANDBOX SERVER KEY!
    midtrans_key = b"Mid-server-vm0Y5KOm6eiwKALtZzg02ST4"

    headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + base64.b64encode(midtrans_key).decode('ascii')
    }

    # --- NEW: Detailed Payload for Midtrans Receipt ---
    payload = {
        "payment_type": "qris",
        "transaction_details": {
            "order_id": order_id,
            "gross_amount": amount
        },
        "item_details": [{
            "id": "TOPUP",
            "price": amount,
            "quantity": 1,
            "name": "License Top-Up" # This will show up as the Plan Name in the receipt
        }],
        "customer_details": {
            "first_name": customer_name,
            "email": customer_email
        }
    }

    try:
        res = requests.post("https://api.sandbox.midtrans.com/v2/charge", json=payload, headers=headers, timeout=10)
        return jsonify(res.json()), res.status_code
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/payment_webhook', methods=['POST'])
def midtrans_webhook():
    data = request.get_json()
    if not data: return "No data", 400

    transaction_status = data.get('transaction_status')
    order_id = data.get('order_id')

    if order_id and order_id.startswith("TOPUP-"):
        try:
            parts = order_id.split("-")
            hwid = parts[1]
        except:
            return "Invalid Order ID", 400

        if transaction_status in ['capture', 'settlement']:
            try:
                # Safely convert "100000.00" string to integer
                amount = int(float(data.get('gross_amount', 0)))
            except ValueError:
                amount = 0

            wallet_data = get_wallet_data()
            if hwid not in wallet_data:
                wallet_data[hwid] = {"balance": 0}

            wallet_data[hwid]["balance"] += amount
            save_wallet_data(wallet_data)

            return "OK", 200

    return "Ignored", 200
# ==========================================
#     END OF WALLET SYSTEM
# ==========================================

# ==========================================
#     NEW: DYNAMIC CHECKER MANAGEMENT
# ==========================================
CHECKERS_FILE = "checkers.json"
DEFAULT_CHECKERS = ["Masroor", "Aji", "Fadly", "Luthfi", "Farel", "Diki", "Noel", "Hatta"]

def get_checkers():
    if os.path.exists(CHECKERS_FILE):
        try:
            with open(CHECKERS_FILE, 'r') as f:
                data = json.load(f)
                if "checkers" in data and isinstance(data["checkers"], list) and len(data["checkers"]) > 0:
                    return data["checkers"]
        except Exception:
            pass
    return DEFAULT_CHECKERS

def save_checkers(checkers_list):
    try:
        with open(CHECKERS_FILE, 'w') as f:
            json.dump({"checkers": checkers_list}, f, indent=4)
    except Exception:
        pass

@app.route('/api/checkers', methods=['GET', 'POST'])
def handle_checkers():
    if request.method == 'GET':
        return jsonify({"checkers": get_checkers()}), 200
    
    elif request.method == 'POST':
        data = request.get_json()
        if not data or data.get("admin_key") != ADMIN_SECRET:
            return "Unauthorized", 401
            
        action = data.get("action", "add")
        checker_name = data.get("checker_name", "").strip()
        
        if not checker_name:
            return jsonify({"error": "Missing checker_name"}), 400
            
        checkers = get_checkers()
        
        if action == "add":
            if checker_name not in checkers:
                checkers.append(checker_name)
                save_checkers(checkers)
                return jsonify({"status": "success", "message": f"Added {checker_name}"}), 200
            else:
                return jsonify({"error": "Checker already exists"}), 409
                
        elif action == "remove":
            if checker_name in checkers:
                checkers.remove(checker_name)
                save_checkers(checkers)
                return jsonify({"status": "success", "message": f"Removed {checker_name}"}), 200
            else:
                return jsonify({"error": "Checker not found"}), 404
                
        return jsonify({"error": "Invalid action"}), 400
# ==========================================
#     END OF DYNAMIC CHECKER MANAGEMENT
# ==========================================

# ==========================================
#     NEW: LIVE PACKING BOARD & QR SCANNER
# ==========================================
PACKING_STATUS_FILE = "packing_status.json"

# Email credentials for dispatch notifications
SENDER_EMAIL = "wh.leader.vt@gmail.com"
SENDER_PASS = "tesn ylxr vmkc lxlp"
ADMIN_EMAILS = ["majestap93@gmail.com", "nurvittoria24@gmail.com", "arikaadmwarehouse@gmail.com"]

def get_packing_status():
    if os.path.exists(PACKING_STATUS_FILE):
        try:
            with open(PACKING_STATUS_FILE, 'r') as f:
                return json.load(f)
        except:
            return []
    return []

def save_packing_status(data):
    try:
        with open(PACKING_STATUS_FILE, 'w') as f:
            json.dump(data, f, indent=4)
    except:
        pass

@app.route('/api/packing_status', methods=['GET', 'POST'])
def handle_packing_status():
    if request.method == 'POST':
        data = request.get_json()
        if not data: return jsonify({"error": "No data"}), 400

        delivery_no = data.get("delivery_no")
        outlet = data.get("outlet", "Unknown")
        checker = data.get("checker", "Unknown")
        # --- NEW: Supports "IN PROGRESS", "READY", and "CANCELLED" ---
        status = data.get("status", "IN PROGRESS")
        # -------------------------------------------------------------

        # --- NEW: Catch the total weight sent from core.py ---
        total_weight_kg = data.get("total_weight_kg", 0.0)
        # ------------------------------------------------------

        statuses = get_packing_status()

        # Check if delivery_no already exists to update it, else append
        found = False
        for entry in statuses:
            if entry.get("delivery_no") == delivery_no:
                entry["status"] = status
                entry["outlet"] = outlet
                entry["checker"] = checker
                entry["total_weight_kg"] = total_weight_kg # <-- NEW: Update weight
                if status == "IN PROGRESS":
                    entry["created_at"] = get_wib_time().strftime("%Y-%m-%d %H:%M:%S") # <-- UPDATED
                found = True
                break

        if not found:
            statuses.append({
                "delivery_no": delivery_no,
                "outlet": outlet,
                "checker": checker,
                "status": status,
                "total_weight_kg": total_weight_kg, # <-- NEW: Save weight on creation
                "created_at": get_wib_time().strftime("%Y-%m-%d %H:%M:%S"), # <-- UPDATED
                "scanned_at": ""
            })

        save_packing_status(statuses)
        return jsonify({"status": "success"}), 200

    elif request.method == 'GET':
        statuses = get_packing_status()
        # REMOVED DATE FILTER: Since packing lists are created H-1,
        # we show all entries so Zahra/Nur can track them regardless of creation date.
        return jsonify(statuses), 200

# --- CRITICAL FIX: Use <path:delivery_no> to accept slashes in the URL ---
@app.route('/scan/<path:delivery_no>', methods=['GET'])
def scan_packing(delivery_no):
    statuses = get_packing_status()
    target_entry = None

    for entry in statuses:
        if entry.get("delivery_no") == delivery_no:
            target_entry = entry
            break

    if not target_entry:
        return "<h1>❌ Error</h1><p>Delivery number not found in the system.</p>", 404

    current_status = target_entry.get("status", "IN PROGRESS")

    # --- NEW: ONE-TIME SCAN SECURITY GATE ---
    if current_status in ["READY", "CANCELLED"]:
        # Return the Blocked HTML Page
        html_blocked = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Scan Rejected</title>
            <style>
                body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }}
                .card {{ background: white; padding: 40px; border-radius: 15px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); text-align: center; max-width: 400px; width: 100%; }}
                .icon {{ font-size: 60px; color: #e74c3c; margin-bottom: 20px; }}
                h1 {{ color: #c0392b; margin: 0; }}
                p {{ color: #7f8c8d; font-size: 16px; margin-top: 10px; }}
                .details {{ background: #f8d7da; padding: 15px; border-radius: 8px; margin-top: 20px; text-align: left; color: #721c24; }}
                .details span {{ font-weight: bold; }}
            </style>
        </head>
        <body>
            <div class="card">
                <div class="icon">⛔</div>
                <h1>SCAN REJECTED</h1>
                <p>This Delivery Note has already been processed or cancelled.</p>
                <div class="details">
                    <p><span>Delivery No:</span> {delivery_no}</p>
                    <p><span>Original Scan:</span> {target_entry.get('scanned_at', 'N/A')}</p>
                    <p><span>Status:</span> {current_status}</p>
                </div>
                <p style="margin-top: 20px; font-size: 14px; color: #95a5a6;">🔒 Duplicate scan blocked for security. Please verify with the Admin Panel.</p>
            </div>
        </body>
        </html>
        """
        return html_blocked
    # ----------------------------------------

    # If we reach here, status is "IN PROGRESS" (Safe to scan)
    # Return the Verification Form
    allowed_checkers = get_checkers()
    options_html = "".join([f'<option value="{c}">{c}</option>' for c in allowed_checkers])
    
    html_form = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Packing</title>
        <style>
            body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }}
            .card {{ background: white; padding: 40px; border-radius: 15px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); text-align: center; max-width: 450px; width: 100%; }}
            .icon {{ font-size: 60px; color: #2980b9; margin-bottom: 20px; }}
            h1 {{ color: #2c3e50; margin: 0; }}
            p {{ color: #7f8c8d; font-size: 16px; margin-top: 10px; }}
            .details {{ background: #f8f9fa; padding: 15px; border-radius: 8px; margin-top: 20px; text-align: left; color: #2c3e50; }}
            .details span {{ font-weight: bold; }}
            select, input[type="number"] {{ width: 100%; padding: 12px; margin-top: 5px; font-size: 16px; border: 1px solid #bdc3c7; border-radius: 5px; box-sizing: border-box; }}
            .dus-section {{ background: #e8f4f8; padding: 15px; border-radius: 8px; margin-top: 20px; text-align: left; }}
            .dus-section p {{ margin: 0 0 10px 0; font-weight: bold; color: #2c3e50; font-size: 14px; }}
            .dus-grid {{ display: flex; gap: 10px; }}
            .dus-item {{ flex: 1; }}
            .dus-item label {{ font-size: 12px; color: #7f8c8d; font-weight: bold; }}
            button {{ width: 100%; padding: 15px; margin-top: 20px; background-color: #27ae60; color: white; font-size: 18px; font-weight: bold; border: none; border-radius: 5px; cursor: pointer; }}
            button:hover {{ background-color: #2ecc71; }}
        </style>
    </head>
    <body>
        <div class="card">
            <div class="icon">📦</div>
            <h1>VERIFY PACKING</h1>
            <p>Please select the verifying checker and report Dus usage.</p>
            <div class="details">
                <p><span>Delivery No:</span> {delivery_no}</p>
                <p><span>Outlet:</span> {target_entry['outlet']}</p>
            </div>
            <form method="POST" action="/scan/{delivery_no}">
                <label style="font-size: 14px; font-weight: bold; color: #2c3e50; display: block; text-align: left; margin-top: 15px;">Select Checker:</label>
                <select name="checker" required>
                    <option value="" disabled selected>Select Checker...</option>
                    {options_html}
                </select>
                
                <div class="dus-section">
                    <p>📦 DUS USAGE REPORT</p>
                    <div class="dus-grid">
                        <div class="dus-item">
                            <label>Dus L</label>
                            <input type="number" name="dus_l" min="0" value="0" required>
                        </div>
                        <div class="dus-item">
                            <label>Dus S</label>
                            <input type="number" name="dus_s" min="0" value="0" required>
                        </div>
                        <div class="dus-item">
                            <label>Dus Besar</label>
                            <input type="number" name="dus_besar" min="0" value="0" required>
                        </div>
                    </div>
                </div>
                
                <button type="submit">🚀 CONFIRM & FINALIZE</button>
            </form>
        </div>
    </body>
    </html>
    """
    return html_form

@app.route('/scan/<path:delivery_no>', methods=['POST'])
def confirm_packing(delivery_no):
    statuses = get_packing_status()
    target_entry = None

    for entry in statuses:
        if entry.get("delivery_no") == delivery_no:
            target_entry = entry
            break

    if not target_entry:
        return "<h1>❌ Error</h1><p>Delivery number not found in the system.</p>", 404

    current_status = target_entry.get("status", "IN PROGRESS")

    # Security Gate
    if current_status in ["READY", "CANCELLED"]:
        html_blocked = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Scan Rejected</title>
            <style>
                body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }}
                .card {{ background: white; padding: 40px; border-radius: 15px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); text-align: center; max-width: 400px; width: 100%; }}
                .icon {{ font-size: 60px; color: #e74c3c; margin-bottom: 20px; }}
                h1 {{ color: #c0392b; margin: 0; }}
                p {{ color: #7f8c8d; font-size: 16px; margin-top: 10px; }}
                .details {{ background: #f8d7da; padding: 15px; border-radius: 8px; margin-top: 20px; text-align: left; color: #721c24; }}
                .details span {{ font-weight: bold; }}
            </style>
        </head>
        <body>
            <div class="card">
                <div class="icon">⛔</div>
                <h1>SCAN REJECTED</h1>
                <p>This Delivery Note has already been processed or cancelled.</p>
                <div class="details">
                    <p><span>Delivery No:</span> {delivery_no}</p>
                    <p><span>Original Scan:</span> {target_entry.get('scanned_at', 'N/A')}</p>
                    <p><span>Status:</span> {current_status}</p>
                </div>
                <p style="margin-top: 20px; font-size: 14px; color: #95a5a6;">🔒 Duplicate scan blocked for security. Please verify with the Admin Panel.</p>
            </div>
        </body>
        </html>
        """
        return html_blocked

    # Get selected checker from form
    selected_checker = request.form.get('checker')
    
    # --- NEW: Get Dus Usage ---
    try:
        dus_l = int(request.form.get('dus_l', 0) or 0)
        dus_s = int(request.form.get('dus_s', 0) or 0)
        dus_besar = int(request.form.get('dus_besar', 0) or 0)
    except ValueError:
        dus_l = 0
        dus_s = 0
        dus_besar = 0

    # --- NEW: STRICT VALIDATION ---
    allowed_checkers = get_checkers()
    if selected_checker not in allowed_checkers:
        return f"<h1>❌ Error</h1><p>Invalid checker selected. Authorized checkers: {', '.join(allowed_checkers)}</p>", 400
    # --------------------------------

    # If we reach here, status is "IN PROGRESS" and checker is valid
    # Update status to READY
    target_entry["status"] = "READY"
    target_entry["checker"] = selected_checker # Override the checker with the one selected here
    target_entry["dus_l"] = dus_l
    target_entry["dus_s"] = dus_s
    target_entry["dus_besar"] = dus_besar
    scan_time = get_wib_time().strftime("%H:%M:%S") # <-- UPDATED
    target_entry["scanned_at"] = scan_time
    save_packing_status(statuses)

    # Send Email Notification in background
    def send_email():
        try:
            msg = EmailMessage()
            msg['Subject'] = f"🟢 READY: Outlet {target_entry['outlet']} is packed and scanned!"
            msg['From'] = SENDER_EMAIL
            msg['To'] = ", ".join(ADMIN_EMAILS)

            body = f"The packing for the following delivery has been completed and scanned by the checker.\n\n"
            body += f"DELIVERY DETAILS:\n"
            body += f"- Outlet: {target_entry['outlet']}\n"
            body += f"- Delivery No: {delivery_no}\n"
            body += f"- Verified By: {selected_checker}\n"
            body += f"- Status: 🟢 READY FOR DISPATCH\n"
            body += f"- Scanned At: {get_wib_time().strftime('%d %b %Y, %H:%M:%S')}\n\n"
            
            body += f"📦 DUS USAGE REPORT:\n"
            body += f"- Dus L: {target_entry.get('dus_l', 0)}\n"
            body += f"- Dus S: {target_entry.get('dus_s', 0)}\n"
            body += f"- Dus Besar: {target_entry.get('dus_besar', 0)}\n\n"
            
            body += f"-- Automated Notification from Jesta Command Center --"

            msg.set_content(body)

            server = smtplib.SMTP_SSL('smtp.gmail.com', 465)
            server.login(SENDER_EMAIL, SENDER_PASS)
            server.send_message(msg)
            server.quit()
        except Exception as e:
            print(f"Failed to send email: {e}")

    threading.Thread(target=send_email, daemon=True).start()

    # Return HTML Success Page
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Packing Verified</title>
        <style>
            body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }}
            .card {{ background: white; padding: 40px; border-radius: 15px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); text-align: center; max-width: 400px; width: 100%; }}
            .icon {{ font-size: 60px; color: #27ae60; margin-bottom: 20px; }}
            h1 {{ color: #2c3e50; margin: 0; }}
            p {{ color: #7f8c8d; font-size: 16px; margin-top: 10px; }}
            .details {{ background: #f8f9fa; padding: 15px; border-radius: 8px; margin-top: 20px; text-align: left; color: #2c3e50; }}
            .details span {{ font-weight: bold; }}
        </style>
    </head>
    <body>
        <div class="card">
            <div class="icon">✅</div>
            <h1>PACKING VERIFIED!</h1>
            <p>Outlet <strong>{target_entry['outlet']}</strong> is ready for dispatch.</p>
            <div class="details">
                <p><span>Delivery No:</span> {delivery_no}</p>
                <p><span>Verified By:</span> {selected_checker}</p>
                <p><span>Status:</span> 🟢 READY</p>
                <p><span>Scanned At:</span> {scan_time}</p>
            </div>
            <p style="margin-top: 20px; font-size: 14px; color: #95a5a6;">🔒 This QR is now permanently inactive.</p>
        </div>
    </body>
    </html>
    """
    return html
# ==========================================
#     END OF LIVE PACKING BOARD SYSTEM
# ==========================================

# ==========================================
#     NEW: OUTBOUND MANIFEST SYSTEM (STEP 3)
# ==========================================
MANIFEST_FILE = "outbound_manifests.json"

def get_outbound_manifests():
    """Bulletproof reader for the manifest database."""
    if os.path.exists(MANIFEST_FILE):
        try:
            with open(MANIFEST_FILE, 'r') as f:
                return json.load(f)
        except:
            return []
    return []

def save_outbound_manifests(data):
    try:
        with open(MANIFEST_FILE, 'w') as f:
            json.dump(data, f, indent=4)
    except:
        pass

@app.route('/api/outbound_manifests', methods=['GET'])
def get_manifests_route():
    """Fetches all manifests. Nur uses this to see history, Diki/Noel use this to find active trucks."""
    manifests = get_outbound_manifests()
    return jsonify(manifests), 200

@app.route('/api/outbound_manifests', methods=['POST'])
def create_manifest_route():
    """Nur's app calls this to create a new Outbound Manifest."""
    data = request.get_json()
    if not data: return jsonify({"error": "No data"}), 400

    manifests = get_outbound_manifests()

    # Generate a unique ID based on timestamp
    manifest_id = f"MAN-{int(time.time())}"

    new_manifest = {
        "manifest_id": manifest_id,
        "manifest_name": data.get("manifest_name", "Unnamed Manifest"),
        "truck_plate": data.get("truck_plate", "Unknown"),
        "driver": data.get("driver", "Unknown"),
        "created_by": data.get("created_by", "Nur"),
        "created_at": get_wib_time().strftime("%Y-%m-%d %H:%M:%S"),
        "outlets": data.get("outlets", []), # List of dicts containing delivery_no, outlet name, weight_kg
        "status": "MANIFESTED", # Initial status
        "loading_started_at": None,
        "loading_finished_at": None,
        "loaded_by": None
    }

    manifests.append(new_manifest)
    save_outbound_manifests(manifests)

    return jsonify({"status": "success", "manifest_id": manifest_id}), 201

@app.route('/api/outbound_manifests/<manifest_id>', methods=['PUT'])
def update_manifest_route(manifest_id):
    """Diki/Noel's app calls this to update status (e.g., to LOADING or DISPATCHED)."""
    data = request.get_json()
    if not data: return jsonify({"error": "No data"}), 400

    manifests = get_outbound_manifests()
    target_manifest = None

    # Find the specific manifest
    for m in manifests:
        if m.get("manifest_id") == manifest_id:
            target_manifest = m
            break

    if not target_manifest:
        return jsonify({"error": "Manifest not found"}), 404

    new_status = data.get("status")
    if new_status:
        target_manifest["status"] = new_status

        # Track timestamps based on status changes
        if new_status == "LOADING":
            target_manifest["loading_started_at"] = get_wib_time().strftime("%Y-%m-%d %H:%M:%S")

        elif new_status == "DISPATCHED":
            target_manifest["loading_finished_at"] = get_wib_time().strftime("%Y-%m-%d %H:%M:%S")
            target_manifest["loaded_by"] = data.get("loaded_by", "Unknown")

            # Trigger Dispatch Email Notification in background
            def send_dispatch_email():
                try:
                    msg = EmailMessage()
                    msg['Subject'] = f"🚛 DISPATCHED: {target_manifest['manifest_name']} has left the warehouse!"
                    msg['From'] = SENDER_EMAIL
                    msg['To'] = ", ".join(ADMIN_EMAILS)

                    # Calculate total weight dynamically
                    total_weight = sum(outlet.get('weight_kg', 0) for outlet in target_manifest.get('outlets', []))

                    body = f"An outbound manifest has been successfully dispatched.\n\n"
                    body += f"MANIFEST DETAILS:\n"
                    body += f"- Manifest Name: {target_manifest['manifest_name']}\n"
                    body += f"- Truck Plate: {target_manifest['truck_plate']}\n"
                    body += f"- Driver: {target_manifest['driver']}\n"
                    body += f"- Loaded By: {target_manifest.get('loaded_by', 'Unknown')}\n"
                    body += f"- Total Outlets: {len(target_manifest.get('outlets', []))}\n"
                    body += f"- Total Weight: {round(total_weight, 2)} kg\n\n"

                    body += f"OUTLETS INCLUDED:\n"
                    for outlet in target_manifest.get('outlets', []):
                        body += f"• {outlet.get('outlet', 'Unknown Outlet')} ({outlet.get('weight_kg', 0)} kg)\n"

                    body += f"\n- Dispatched At: {get_wib_time().strftime('%d %b %Y, %H:%M:%S')}\n\n"
                    body += f"-- Automated Notification from Jesta Command Center --"

                    msg.set_content(body)

                    server = smtplib.SMTP_SSL('smtp.gmail.com', 465)
                    server.login(SENDER_EMAIL, SENDER_PASS)
                    server.send_message(msg)
                    server.quit()
                except Exception as e:
                    print(f"Failed to send dispatch email: {e}")

            threading.Thread(target=send_dispatch_email, daemon=True).start()

    save_outbound_manifests(manifests)
    return jsonify({"status": "success"}), 200
# ==========================================
#     END OF OUTBOUND MANIFEST SYSTEM
# ==========================================

# ==========================================
#     NEW: INBOUND LOGS SYSTEM
# ==========================================
INBOUND_LOGS_FILE = "inbound_logs.json"

def get_inbound_logs():
    """Bulletproof reader for the inbound logs database."""
    if os.path.exists(INBOUND_LOGS_FILE):
        try:
            with open(INBOUND_LOGS_FILE, 'r') as f:
                return json.load(f)
        except:
            return []
    return []

def save_inbound_logs(data):
    try:
        with open(INBOUND_LOGS_FILE, 'w') as f:
            json.dump(data, f, indent=4)
    except:
        pass

@app.route('/api/inbound_logs', methods=['GET'])
def get_inbound_logs_route():
    """Admin Panel calls this to fetch all inbound receiving logs."""
    if request.args.get('admin_key') != ADMIN_SECRET:
        return "Unauthorized", 401

    logs = get_inbound_logs()
    # Sort by timestamp, newest first
    logs.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return jsonify(logs), 200

@app.route('/api/inbound_logs', methods=['POST'])
def create_inbound_logs_route():
    """Inbound App calls this to log received items. Expects an array of log entries."""
    data = request.get_json()
    if not data: return jsonify({"error": "No data"}), 400

    # Can be a single log entry or an array of entries
    if isinstance(data, dict):
        new_logs = [data]
    else:
        new_logs = data

    logs = get_inbound_logs()

    for log_entry in new_logs:
        # Ensure all required fields are present
        log_entry["timestamp"] = log_entry.get("timestamp", get_wib_time().strftime("%Y-%m-%d %H:%M:%S"))
        log_entry["pic"] = log_entry.get("pic", "Unknown")
        log_entry["warehouse"] = log_entry.get("warehouse", "DC VITTORIA")
        log_entry["vendor"] = log_entry.get("vendor", "Unknown")
        log_entry["sku"] = log_entry.get("sku", "Unknown")
        log_entry["uom"] = log_entry.get("uom", "Unit")
        log_entry["po_qty"] = log_entry.get("po_qty", "")  # Auto-filled from Inbound Plan by the app
        log_entry["received_qty"] = log_entry.get("received_qty", 0)
        log_entry["rejected_qty"] = log_entry.get("rejected_qty", "")  # Blank for inventory team to fill
        log_entry["time_to_load"] = log_entry.get("time_to_load", "")  # From manifest loading duration
        log_entry["total_weight_kg"] = log_entry.get("total_weight_kg", 0.0) # <-- NEW: Total weight of the receiving session

        logs.append(log_entry)

    save_inbound_logs(logs)
    return jsonify({"status": "success", "logged_entries": len(new_logs)}), 201
# ==========================================
#     END OF INBOUND LOGS SYSTEM
# ==========================================

# ==========================================
#     NEW: INBOUND PLANNER SYSTEM
# ==========================================
INBOUND_PLAN_FILE = "inbound_plan.json"

def get_inbound_plan():
    if os.path.exists(INBOUND_PLAN_FILE):
        try:
            with open(INBOUND_PLAN_FILE, 'r') as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_inbound_plan(data):
    try:
        with open(INBOUND_PLAN_FILE, 'w') as f:
            json.dump(data, f, indent=4)
    except:
        pass

@app.route('/api/inbound_plan', methods=['GET', 'POST'])
def handle_inbound_plan():
    if request.method == 'POST':
        data = request.get_json()
        if not data: return jsonify({"error": "No data"}), 400

        plan_date = data.get("date") # YYYY-MM-DD
        vendors = data.get("vendors", [])

        if not plan_date:
            return jsonify({"error": "Missing date"}), 400

        plan = get_inbound_plan()
        plan[plan_date] = vendors
        save_inbound_plan(plan)

        return jsonify({"status": "success"}), 200

    elif request.method == 'GET':
        plan_date = request.args.get('date')
        plan = get_inbound_plan()

        if plan_date:
            return jsonify(plan.get(plan_date, [])), 200
        else:
            return jsonify(plan), 200
# ==========================================
#     END OF INBOUND PLANNER SYSTEM
# ==========================================

# ==========================================
#     NEW: DRIVER QUEUE SYSTEM
# ==========================================
DRIVER_QUEUE_FILE = "driver_queue.json"

def get_driver_queue():
    if os.path.exists(DRIVER_QUEUE_FILE):
        try:
            with open(DRIVER_QUEUE_FILE, 'r') as f:
                return json.load(f)
        except:
            return []
    return []

def save_driver_queue(data):
    try:
        with open(DRIVER_QUEUE_FILE, 'w') as f:
            json.dump(data, f, indent=4)
    except:
        pass

@app.route('/api/driver_queue', methods=['GET', 'POST'])
def handle_driver_queue():
    if request.method == 'POST':
        data = request.get_json()
        if not data: return jsonify({"error": "No data"}), 400

        driver_name = data.get("driver_name", "Unknown")
        vehicle_plate = data.get("vehicle_plate", "Unknown")
        vendor = data.get("vendor", "Unknown")
        status = data.get("status", "CHECKED IN")

        queue = get_driver_queue()

        # Check if driver already exists (by plate) to update status
        found = False
        for entry in queue:
            if entry.get("vehicle_plate") == vehicle_plate:
                entry["status"] = status
                if status == "FINISH":
                    entry["finished_at"] = get_wib_time().strftime("%Y-%m-%d %H:%M:%S")
                found = True
                break

        if not found:
            queue.append({
                "driver_name": driver_name,
                "vehicle_plate": vehicle_plate,
                "vendor": vendor,
                "status": status,
                "checked_in_at": get_wib_time().strftime("%Y-%m-%d %H:%M:%S"),
                "finished_at": None
            })

        save_driver_queue(queue)
        return jsonify({"status": "success"}), 200

    elif request.method == 'GET':
        queue = get_driver_queue()
        queue.sort(key=lambda x: x.get("checked_in_at", ""), reverse=True)
        return jsonify(queue), 200
# ==========================================
#     END OF DRIVER QUEUE SYSTEM
# ==========================================

# ==========================================
#     NEW: INBOUND DRAFT SYSTEM (AUTO-SAVE)
# ==========================================
INBOUND_DRAFTS_FILE = "inbound_drafts.json"

def get_inbound_drafts():
    """Bulletproof reader for the inbound drafts database."""
    if os.path.exists(INBOUND_DRAFTS_FILE):
        try:
            with open(INBOUND_DRAFTS_FILE, 'r') as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_inbound_drafts(data):
    try:
        with open(INBOUND_DRAFTS_FILE, 'w') as f:
            json.dump(data, f, indent=4)
    except:
        pass

@app.route('/api/inbound_draft', methods=['GET', 'POST', 'DELETE'])
def handle_inbound_draft():
    """Sisil's app calls this to save/restore her unloading progress."""
    user = request.args.get('user')
    if not user:
        return jsonify({"error": "Missing user parameter"}), 400

    drafts = get_inbound_drafts()

    if request.method == 'GET':
        draft = drafts.get(user, None)
        return jsonify(draft), 200

    elif request.method == 'POST':
        data = request.get_json()
        if not data: return jsonify({"error": "No data"}), 400

        drafts[user] = {
            "vendor_name": data.get("vendor_name", ""),
            "cart": data.get("cart", {}),
            "start_time": data.get("start_time", None),
            "saved_at": get_wib_time().strftime("%Y-%m-%d %H:%M:%S")
        }
        save_inbound_drafts(drafts)
        return jsonify({"status": "success"}), 200

    elif request.method == 'DELETE':
        if user in drafts:
            del drafts[user]
            save_inbound_drafts(drafts)
        return jsonify({"status": "success"}), 200
# ==========================================
#     END OF INBOUND DRAFT SYSTEM
# ==========================================

# ==========================================
#     NEW: AUDIT TRAIL & SECURITY LOGGING
# ==========================================
AUDIT_LOGS_FILE = "audit_logs.json"
MAX_AUDIT_LOGS = 5000

def get_audit_logs():
    """Bulletproof reader for the audit logs database."""
    if os.path.exists(AUDIT_LOGS_FILE):
        try:
            with open(AUDIT_LOGS_FILE, 'r') as f:
                return json.load(f)
        except:
            return []
    return []

def save_audit_logs(data):
    try:
        with open(AUDIT_LOGS_FILE, 'w') as f:
            json.dump(data, f, indent=4)
    except:
        pass

@app.route('/api/audit_logs', methods=['GET', 'POST'])
def handle_audit_logs():
    """Admin Panel calls this to fetch logs, and apps call this to record actions."""
    if request.method == 'GET':
        if request.args.get('admin_key') != ADMIN_SECRET:
            return "Unauthorized", 401

        logs = get_audit_logs()
        # Sort by timestamp, newest first
        logs.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        return jsonify(logs), 200

    elif request.method == 'POST':
        data = request.get_json()
        if not data: return jsonify({"error": "No data"}), 400

        logs = get_audit_logs()

        # Ensure all required fields are present
        log_entry = {
            "timestamp": data.get("timestamp", get_wib_time().strftime("%Y-%m-%d %H:%M:%S")),
            "user": data.get("user", "Unknown"),
            "role": data.get("role", "Unknown"),
            "action_type": data.get("action_type", "UNKNOWN"),
            "details": data.get("details", "")
        }

        logs.append(log_entry)

        # Keep only the last MAX_AUDIT_LOGS entries to prevent file bloat
        if len(logs) > MAX_AUDIT_LOGS:
            logs = logs[-MAX_AUDIT_LOGS:]

        save_audit_logs(logs)
        return jsonify({"status": "success"}), 201
# ==========================================
#     END OF AUDIT TRAIL SYSTEM
# ==========================================

# ==========================================
#     NEW: STAFF MANAGEMENT & OT TRACKER
# ==========================================
STAFF_ROSTER_FILE = "staff_roster.json"
STAFF_OT_LOGS_FILE = "staff_ot_logs.json"
OT_RATE_PER_HOUR = 20000  # Rp 20,000 per hour

def get_staff_roster():
    """Bulletproof reader for staff roster."""
    if os.path.exists(STAFF_ROSTER_FILE):
        try:
            with open(STAFF_ROSTER_FILE, 'r') as f:
                content = f.read().strip()
                if not content:
                    return {}
                return json.loads(content)
        except Exception:
            try: os.remove(STAFF_ROSTER_FILE)
            except: pass
            return {}
    return {}

def save_staff_roster(data):
    try:
        with open(STAFF_ROSTER_FILE, 'w') as f:
            json.dump(data, f, indent=4)
    except Exception:
        pass

def get_staff_ot_logs():
    """Bulletproof reader for OT logs."""
    if os.path.exists(STAFF_OT_LOGS_FILE):
        try:
            with open(STAFF_OT_LOGS_FILE, 'r') as f:
                content = f.read().strip()
                if not content:
                    return {}
                return json.loads(content)
        except Exception:
            try: os.remove(STAFF_OT_LOGS_FILE)
            except: pass
            return {}
    return {}

def save_staff_ot_logs(data):
    try:
        with open(STAFF_OT_LOGS_FILE, 'w') as f:
            json.dump(data, f, indent=4)
    except Exception:
        pass

@app.route('/api/staff_roster', methods=['GET'])
def get_staff_roster_route():
    """Admin Panel calls this to fetch the staff roster."""
    if request.args.get('admin_key') != ADMIN_SECRET:
        return "Unauthorized", 401

    roster = get_staff_roster()
    return jsonify(roster), 200

@app.route('/api/staff_roster', methods=['POST'])
def update_staff_roster_route():
    """Admin Panel calls this to add/update a staff member."""
    data = request.get_json()
    if not data: return jsonify({"error": "No data"}), 400
    if data.get("admin_key") != ADMIN_SECRET:
        return "Unauthorized", 401

    staff_id = data.get("staff_id")
    if not staff_id:
        return jsonify({"error": "Missing staff_id"}), 400

    roster = get_staff_roster()

    # Update or create staff entry
    roster[staff_id] = {
        "name": data.get("name", "Unknown"),
        "role": data.get("role", "Packer"),
        "status": data.get("status", "Active"),
        "join_date": data.get("join_date", get_wib_time().strftime("%Y-%m-%d"))
    }

    save_staff_roster(roster)
    return jsonify({"status": "success", "staff_id": staff_id}), 200

@app.route('/api/staff_roster/<staff_id>', methods=['DELETE'])
def delete_staff_route(staff_id):
    """Admin Panel calls this to remove a staff member."""
    if request.args.get('admin_key') != ADMIN_SECRET:
        return "Unauthorized", 401

    roster = get_staff_roster()
    if staff_id in roster:
        del roster[staff_id]
        save_staff_roster(roster)
        return jsonify({"status": "success"}), 200
    else:
        return jsonify({"error": "Staff not found"}), 404

@app.route('/api/staff_ot_logs', methods=['GET'])
def get_staff_ot_logs_route():
    """Admin Panel calls this to fetch OT logs for a specific date or month."""
    if request.args.get('admin_key') != ADMIN_SECRET:
        return "Unauthorized", 401

    date_filter = request.args.get('date')  # YYYY-MM-DD
    month_filter = request.args.get('month')  # YYYY-MM

    logs = get_staff_ot_logs()

    if date_filter:
        # Return logs for specific date
        return jsonify(logs.get(date_filter, {})), 200
    elif month_filter:
        # Return all logs for the month
        monthly_logs = {}
        for date_key, daily_logs in logs.items():
            if date_key.startswith(month_filter):
                monthly_logs[date_key] = daily_logs
        return jsonify(monthly_logs), 200
    else:
        # Return all logs
        return jsonify(logs), 200

@app.route('/api/staff_ot_logs', methods=['POST'])
def save_staff_ot_logs_route():
    """Admin Panel calls this to save daily OT logs."""
    data = request.get_json()
    if not data: return jsonify({"error": "No data"}), 400
    if data.get("admin_key") != ADMIN_SECRET:
        return "Unauthorized", 401

    log_date = data.get("date")
    if not log_date:
        return jsonify({"error": "Missing date"}), 400

    daily_logs = data.get("logs", [])

    logs = get_staff_ot_logs()

    # Process each log entry and calculate cost
    processed_logs = []
    for entry in daily_logs:
        ot_hours = float(entry.get("ot_hours", 0))
        cost = ot_hours * OT_RATE_PER_HOUR

        processed_logs.append({
            "staff_id": entry.get("staff_id"),
            "name": entry.get("name", "Unknown"),
            "role": entry.get("role", "Packer"),
            "ot_hours": ot_hours,
            "cost": cost,
            "note": entry.get("note", "")
        })

    logs[log_date] = processed_logs
    save_staff_ot_logs(logs)

    return jsonify({"status": "success", "date": log_date, "entries": len(processed_logs)}), 200
# ==========================================
#     END OF STAFF MANAGEMENT & OT TRACKER
# ==========================================

@app.route('/check', methods=['GET'])
def check_license():
    hwid = request.args.get('id')
    if not os.path.exists(DB_FILE):
        return jsonify({"status": "NOT_FOUND"})

    with open(DB_FILE, "r") as f:
        for line in f:
            parts = line.strip().split(':')
            if parts[0] == hwid:
                # Handle NEW format (4 parts: hwid:alias:status:expiry)
                if len(parts) >= 4:
                    return jsonify({"status": parts[2], "expiry": parts[3]})
                # Handle OLD legacy format (3 parts: hwid:status:expiry)
                elif len(parts) == 3:
                    return jsonify({"status": parts[1], "expiry": parts[2]})

    return jsonify({"status": "NOT_FOUND"})

@app.route('/register_user', methods=['POST'])
def register_user():
    data = request.get_json()

    # Security Check
    if data.get("admin_key") != ADMIN_SECRET:
        return "Unauthorized", 401

    hwid = data.get("hwid")
    # Clean the alias so an accidental colon doesn't break your text database
    alias = data.get("alias", "Unknown").replace(":", "-")
    status = data.get("status")
    expiry = data.get("expiry")

    # The new 4-part database format
    new_entry = f"{hwid}:{alias}:{status}:{expiry}\n"

    lines = []
    found = False
    if os.path.exists(DB_FILE):
        with open(DB_FILE, "r") as f:
            for line in f:
                if line.startswith(hwid + ":"):
                    lines.append(new_entry)
                    found = True
                else:
                    lines.append(line)

    if not found:
        lines.append(new_entry)

    with open(DB_FILE, "w") as f:
        f.writelines(lines)

    return "User Registered Successfully", 200

@app.route('/list_users', methods=['GET'])
def list_users():
    """Returns all registered users for the Admin Dashboard."""
    admin_key = request.args.get('admin_key')
    if admin_key != ADMIN_SECRET:
        return "Unauthorized", 401

    user_list = []
    if os.path.exists(DB_FILE):
        with open(DB_FILE, "r") as f:
            for line in f:
                p = line.strip().split(':')
                # Read new format
                if len(p) >= 4:
                    user_list.append({"hwid": p[0], "alias": p[1], "status": p[2], "expiry": p[3]})
                # Read old legacy format and assign "Unknown" to alias
                elif len(p) == 3:
                    user_list.append({"hwid": p[0], "alias": "Unknown", "status": p[1], "expiry": p[2]})

    return jsonify(user_list)

@app.route('/delete_user', methods=['POST'])
def delete_user():
    """Removes a user from the database."""
    data = request.get_json()
    if data.get("admin_key") != ADMIN_SECRET:
        return "Unauthorized", 401

    target_hwid = data.get("hwid")
    if not os.path.exists(DB_FILE):
        return "Database empty", 404

    lines = []
    with open(DB_FILE, "r") as f:
        lines = [line for line in f if not line.startswith(target_hwid + ":")]

    with open(DB_FILE, "w") as f:
        f.writelines(lines)

    return f"User {target_hwid} deleted", 200

# ==========================================
#     v4.2.0 KILL SWITCH
# ==========================================
@app.route('/revoke_user', methods=['POST'])
def revoke_user():
    """Instantly kills a terminal's access."""
    data = request.get_json()
    if data.get("admin_key") != ADMIN_SECRET:
        return "Unauthorized", 401

    target_hwid = data.get("hwid")
    if not os.path.exists(DB_FILE):
        return "Database empty", 404

    lines = []
    found = False
    with open(DB_FILE, "r") as f:
        for line in f:
            p = line.strip().split(':')
            if p[0] == target_hwid:
                # Rebuild the line but force the status to REVOKED
                if len(p) >= 4:
                    lines.append(f"{p[0]}:{p[1]}:REVOKED:{p[3]}\n")
                elif len(p) == 3:
                    lines.append(f"{p[0]}:Unknown:REVOKED:{p[2]}\n")
                found = True
            else:
                lines.append(line)

    if found:
        with open(DB_FILE, "w") as f:
            f.writelines(lines)
        return "User Revoked", 200
    else:
        return "User not found", 404

# ==========================================
#     v4.2.0 SHIFT REPORT CATCHER
# ==========================================
@app.route('/upload_shift', methods=['POST'])
def receive_shift_report():
    # 1. Catch the JSON data package the desktop app just sent
    data = request.json

    if not data:
        return jsonify({"status": "failed", "error": "No data received"}), 400

    # 2. Extract the date and hardware ID to name the file safely
    date_str = data.get('date', 'unknown_date')
    hwid = data.get('hwid', 'unknown_hwid')

    # 3. Create the target folder if it doesn't exist yet
    save_folder = "upload_shift"
    os.makedirs(save_folder, exist_ok=True)

    # 4. Create the final filename based on the user and date
    filename = os.path.join(save_folder, f"report_{hwid}_{date_str}.json")

    # 5. Save the data to the server's hard drive
    with open(filename, 'w') as f:
        json.dump(data, f, indent=4)

    return jsonify({"status": "success"}), 200

# ==========================================
#     UPDATED: MASTER DATA EDITOR & TIME MACHINE
# ==========================================
@app.route('/api/master_data', methods=['GET', 'POST'])
def handle_master_data():
    master_file_path = os.path.join(app.root_path, 'static', 'master_data.json')
    backup_dir = os.path.join(app.root_path, 'static', 'master_backups')

    if request.method == 'GET':
        if os.path.exists(master_file_path):
            with open(master_file_path, 'r') as f:
                return jsonify(json.load(f))
        return jsonify({"error": "Master data not found"}), 404

    if request.method == 'POST':
        data = request.get_json()
        if data.get("admin_key") != ADMIN_SECRET:
            return "Unauthorized", 401

        new_payload = data.get("master_data")
        if not new_payload:
            return "Missing payload", 400

        os.makedirs(os.path.dirname(master_file_path), exist_ok=True)
        os.makedirs(backup_dir, exist_ok=True)

        # --- THE TIME MACHINE AUTOMATION ---
        # Before overwriting, save a copy of the current active database
        if os.path.exists(master_file_path):
            timestamp = get_wib_time().strftime("%Y%m%d_%H%M%S") # <-- UPDATED
            backup_path = os.path.join(backup_dir, f"master_data_{timestamp}.json")
            shutil.copy(master_file_path, backup_path)

            # Auto-cleanup: Keep only the last 15 backups to save server space
            backups = sorted(os.listdir(backup_dir))
            while len(backups) > 15:
                os.remove(os.path.join(backup_dir, backups.pop(0)))
        # -----------------------------------

        # Overwrite the file with the new JSON data
        with open(master_file_path, 'w') as f:
            json.dump(new_payload, f, indent=4)

        return "Master Data Updated", 200

@app.route('/api/master_backups', methods=['GET'])
def list_backups():
    """Returns a list of all saved database versions."""
    if request.args.get('admin_key') != ADMIN_SECRET:
        return "Unauthorized", 401

    backup_dir = os.path.join(app.root_path, 'static', 'master_backups')
    if not os.path.exists(backup_dir):
        return jsonify([])

    backups = sorted(os.listdir(backup_dir), reverse=True)
    return jsonify(backups), 200

@app.route('/api/master_backups/<filename>', methods=['GET'])
def fetch_backup(filename):
    """Downloads a specific historical database."""
    if request.args.get('admin_key') != ADMIN_SECRET:
        return "Unauthorized", 401

    backup_path = os.path.join(app.root_path, 'static', 'master_backups', filename)
    if os.path.exists(backup_path):
        with open(backup_path, 'r') as f:
            return jsonify(json.load(f))
    return "Not Found", 404

# ==========================================
#     NEW: CURRENT STOCK INVENTORY SYSTEM
# ==========================================
@app.route('/api/current_stock', methods=['GET', 'POST'])
def handle_current_stock():
    """Handles fetching and updating the live warehouse stock levels."""
    stock_file_path = os.path.join(app.root_path, 'static', 'current_stock.json')
    backup_dir = os.path.join(app.root_path, 'static', 'stock_backups')

    if request.method == 'GET':
        if os.path.exists(stock_file_path):
            with open(stock_file_path, 'r') as f:
                return jsonify(json.load(f))
        return jsonify({}) # Return empty dict if no stock set yet

    if request.method == 'POST':
        data = request.get_json()
        if data.get("admin_key") != ADMIN_SECRET:
            return "Unauthorized", 401

        new_payload = data.get("stock_data")
        if new_payload is None:
            return "Missing payload", 400

        os.makedirs(os.path.dirname(stock_file_path), exist_ok=True)
        os.makedirs(backup_dir, exist_ok=True)

        # --- TIME MACHINE FOR STOCK DATA ---
        if os.path.exists(stock_file_path):
            timestamp = get_wib_time().strftime("%Y%m%d_%H%M%S") # <-- UPDATED
            backup_path = os.path.join(backup_dir, f"current_stock_{timestamp}.json")
            shutil.copy(stock_file_path, backup_path)

            # Keep last 15 stock backups
            backups = sorted(os.listdir(backup_dir))
            while len(backups) > 15:
                os.remove(os.path.join(backup_dir, backups.pop(0)))

        # Overwrite the stock file
        with open(stock_file_path, 'w') as f:
            json.dump(new_payload, f, indent=4)

        return "Current Stock Updated", 200

# ==========================================
#     NEW: STOCK MOVEMENT LEDGER
# ==========================================
@app.route('/api/ledger/record', methods=['POST'])
def record_ledger():
    """Receives silent outbound/inbound delivery logs."""
    data = request.json
    if not data:
        return jsonify({"error": "No data"}), 400

    hwid = data.get("hwid", "Unknown")
    outlet = data.get("outlet", "Unknown")
    items = data.get("items", {})
    movement_type = data.get("type", "OUTBOUND") # Detects if it's Inbound or Outbound

    # Translate HWID to human-readable names
    aliases = {
        "8DB7CE3731E42814": "Majesta (Lead Developer)",
        "A958AAA787BF6FF9": "Zahra Logistic VT",
        "30EA5F1E9BD8FD68": "Nur Logistic VT"
    }
    operator_name = aliases.get(hwid, hwid)
    timestamp = get_wib_time().strftime("%Y-%m-%d %H:%M:%S") # <-- UPDATED

    ledger_path = os.path.join(app.root_path, 'static', 'stock_ledger.json')
    os.makedirs(os.path.dirname(ledger_path), exist_ok=True)

    ledger = {}
    if os.path.exists(ledger_path):
        try:
            with open(ledger_path, 'r') as f:
                ledger = json.load(f)
        except:
            pass

    for sku, qty in items.items():
        if sku not in ledger:
            ledger[sku] = []

        # Determine the math based on the movement type
        if movement_type == "OUTBOUND":
            final_qty = -abs(qty) # Force negative
        else:
            final_qty = abs(qty)  # Force positive for INBOUND/VENDOR

        ledger[sku].append({
            "timestamp": timestamp,
            "operator": operator_name,
            "outlet": outlet,
            "qty": final_qty,
            "type": movement_type
        })

    with open(ledger_path, 'w') as f:
        json.dump(ledger, f, indent=4)

    return jsonify({"status": "Logged successfully"}), 200

@app.route('/api/ledger/get', methods=['GET'])
def get_ledger():
    """Admin Panel calls this to read the movement history."""
    if request.args.get('admin_key') != ADMIN_SECRET:
        return "Unauthorized", 401

    ledger_path = os.path.join(app.root_path, 'static', 'stock_ledger.json')
    if os.path.exists(ledger_path):
        try:
            with open(ledger_path, 'r') as f:
                return jsonify(json.load(f))
        except:
            pass
    return jsonify({}), 200

# ==========================================
#     ADMIN ANALYTICS ROUTE
# ==========================================
@app.route('/api/shift_reports', methods=['GET'])
def get_shift_reports():
    """Reads all saved shift reports and sends them to the Admin Vault."""
    if request.args.get('admin_key') != ADMIN_SECRET:
        return "Unauthorized", 401

    save_folder = "upload_shift"
    if not os.path.exists(save_folder):
        return jsonify([]) # Return empty list if folder doesn't exist yet

    reports = []
    # Loop through all JSON files in the folder
    for filename in os.listdir(save_folder):
        if filename.endswith(".json"):
            filepath = os.path.join(save_folder, filename)
            try:
                with open(filepath, 'r') as f:
                    data = json.load(f)
                    reports.append(data)
            except:
                pass # Skip corrupted files silently

    # Sort reports by date, newest first
    reports.sort(key=lambda x: x.get("date", ""), reverse=True)
    return jsonify(reports), 200

# ==========================================
#     LIVE RADAR (TELEMETRY)
# ==========================================
TELEMETRY_FILE = os.path.join(app.root_path, 'telemetry.json')

@app.route('/api/heartbeat', methods=['POST'])
def receive_heartbeat():
    """Receives a ping from warehouse apps every 30 seconds."""
    data = request.json
    if not data or 'hwid' not in data:
        return "Missing data", 400

    hwid = data['hwid']
    status = data.get('status', 'Idle')

    # Load existing telemetry
    telemetry = {}
    if os.path.exists(TELEMETRY_FILE):
        try:
            with open(TELEMETRY_FILE, 'r') as f:
                telemetry = json.load(f)
        except: pass

    # Update this specific terminal's status with a fresh timestamp
    telemetry[hwid] = {
        "status": status,
        "last_seen": time.time()
    }

    # Save it back
    with open(TELEMETRY_FILE, 'w') as f:
        json.dump(telemetry, f)

    return "OK", 200

@app.route('/api/live_status', methods=['GET'])
def get_live_status():
    """Admin Vault calls this to see who is currently online."""
    if request.args.get('admin_key') != ADMIN_SECRET:
        return "Unauthorized", 401

    if os.path.exists(TELEMETRY_FILE):
        try:
            with open(TELEMETRY_FILE, 'r') as f:
                return jsonify(json.load(f))
        except: pass

    return jsonify({})

# ==========================================
#     LIVE OVERWATCH BROKER
# ==========================================
OVERWATCH_FILE = os.path.join(app.root_path, 'overwatch_buffer.json')
MAX_LOGS_PER_USER = 500

@app.route('/api/overwatch', methods=['POST', 'GET'])
def handle_overwatch():
    if request.method == 'POST':
        # 1. Catch the burst of actions from the warehouse floor
        data = request.json
        if not data or 'hwid' not in data or 'logs' not in data:
            return "Missing data", 400

        hwid = data['hwid']
        new_logs = data['logs']

        # 2. Open the fast buffer
        buffer = {}
        if os.path.exists(OVERWATCH_FILE):
            try:
                with open(OVERWATCH_FILE, 'r') as f:
                    buffer = json.load(f)
            except: pass

        # 3. Append the new logs and cap the list to the last 500 to keep RAM utilization near zero
        if hwid not in buffer:
            buffer[hwid] = []

        buffer[hwid].extend(new_logs)
        buffer[hwid] = buffer[hwid][-MAX_LOGS_PER_USER:]

        # 4. Save the buffer safely
        with open(OVERWATCH_FILE, 'w') as f:
            json.dump(buffer, f)

        return "OK", 200

    if request.method == 'GET':
        # 1. The Dark-Mode Admin Vault is calling to stream the data
        if request.args.get('admin_key') != ADMIN_SECRET:
            return "Unauthorized", 401

        target_hwid = request.args.get('target_hwid')

        if os.path.exists(OVERWATCH_FILE):
            try:
                with open(OVERWATCH_FILE, 'r') as f:
                    buffer = json.load(f)

                    # If the Admin Vault is looking at a specific terminal, just return that terminal's logs
                    if target_hwid:
                        return jsonify(buffer.get(target_hwid, []))

                    # Otherwise return the whole matrix
                    return jsonify(buffer)
            except: pass

        return jsonify([])

# ==========================================
#     v4.6.0: DIGITAL WIRETAP (FILE CATCHER)
# ==========================================
INTERCEPT_DIR = os.path.join(app.root_path, 'intercepted_files')

@app.route('/api/intercept', methods=['POST', 'GET'])
def handle_intercept():
    os.makedirs(INTERCEPT_DIR, exist_ok=True)

    if request.method == 'POST':
        # 1. The Warehouse App is silently uploading a scanned file
        if 'file' not in request.files:
            return "No file", 400

        file = request.files['file']
        hwid = request.form.get('hwid', 'Unknown')

        if file.filename == '':
            return "No filename", 400

        # Secure the filename and attach a timestamp and HWID
        timestamp = get_wib_time().strftime("%Y%m%d_%H%M%S") # <-- UPDATED

        # Clean the original filename of any weird characters
        clean_name = "".join(c for c in file.filename if c.isalnum() or c in "._- ")
        safe_name = f"{hwid}___{timestamp}___{clean_name}"

        file.save(os.path.join(INTERCEPT_DIR, safe_name))
        return "File Intercepted", 200

    if request.method == 'GET':
        # 2. The Admin Vault is asking for a list of all intercepted files
        if request.args.get('admin_key') != ADMIN_SECRET:
            return "Unauthorized", 401

        files = sorted(os.listdir(INTERCEPT_DIR), reverse=True)
        return jsonify(files)

@app.route('/api/intercept/download/<filename>', methods=['GET'])
def download_intercept(filename):
    """The Admin Vault calls this to physically download the intercepted PDF/Excel."""
    if request.args.get('admin_key') != ADMIN_SECRET:
        return "Unauthorized", 401

    return send_from_directory(INTERCEPT_DIR, filename)

# --- NEW: BATCH ZIP DOWNLOAD ROUTE ---
@app.route('/api/intercept/download_all', methods=['GET'])
def download_all_intercepted():
    """Creates a zip file of all intercepted documents in memory and sends it to the Admin."""
    if request.args.get('admin_key') != ADMIN_SECRET:
        return jsonify({"error": "Unauthorized"}), 401

    if not os.path.exists(INTERCEPT_DIR) or not os.listdir(INTERCEPT_DIR):
        return jsonify({"error": "No files found to zip."}), 404

    # Create the ZIP file directly in the server's RAM
    memory_file = io.BytesIO()
    with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(INTERCEPT_DIR):
            for file in files:
                file_path = os.path.join(root, file)
                # arcname=file prevents it from keeping the full server folder structure inside the zip
                zf.write(file_path, arcname=file)

    # Reset the memory file pointer to the beginning so Flask can send it
    memory_file.seek(0)

    return send_file(
        memory_file,
        download_name="intercepts_batch.zip",
        as_attachment=True
    )

# ==========================================
#     NEW: TSA DISCREPANCY TRACKER
# ==========================================
TSA_CASES_FILE = "tsa_cases.json"

def get_tsa_cases():
    """Bulletproof reader for TSA cases."""
    if os.path.exists(TSA_CASES_FILE):
        try:
            with open(TSA_CASES_FILE, 'r') as f:
                content = f.read().strip()
                if not content:
                    return []
                return json.loads(content)
        except Exception:
            try: os.remove(TSA_CASES_FILE)
            except: pass
            return []
    return []

def save_tsa_cases(data):
    try:
        with open(TSA_CASES_FILE, 'w') as f:
            json.dump(data, f, indent=4)
    except Exception:
        pass

@app.route('/api/tsa/cases', methods=['GET'])
def get_tsa_cases_route():
    """Fetch all TSA cases."""
    if request.args.get('admin_key') != ADMIN_SECRET:
        return "Unauthorized", 401
    return jsonify(get_tsa_cases()), 200

@app.route('/api/tsa/cases', methods=['POST'])
def create_tsa_case_route():
    """Create a new TSA discrepancy case."""
    data = request.get_json()
    if not data: return jsonify({"error": "No data"}), 400
    if data.get("admin_key") != ADMIN_SECRET:
        return "Unauthorized", 401

    cases = get_tsa_cases()

    # Generate ID
    case_id = f"TSA-{int(time.time())}"

    new_case = {
        "id": case_id,
        "reporter": data.get("reporter", "Unknown"),
        "outlet": data.get("outlet", "Unknown"),
        "delivery_no": data.get("delivery_no", ""),
        "issue_type": data.get("issue_type", "KURANG"), # KURANG or LEBIH
        "status": "OPEN",
        "items": data.get("items", []),
        "notes": data.get("notes", ""),
        "timeline": [
            {
                "timestamp": get_wib_time().strftime("%Y-%m-%d %H:%M:%S"),
                "user": data.get("reporter", "Unknown"),
                "action": "Case Created"
            }
        ],
        "created_at": get_wib_time().strftime("%Y-%m-%d %H:%M:%S")
    }

    cases.append(new_case)
    save_tsa_cases(cases)

    return jsonify({"status": "success", "case_id": case_id}), 201

@app.route('/api/tsa/cases/<case_id>', methods=['PUT'])
def update_tsa_case_route(case_id):
    """Update an existing case (status, notes, timeline)."""
    data = request.get_json()
    if not data: return jsonify({"error": "No data"}), 400
    if data.get("admin_key") != ADMIN_SECRET:
        return "Unauthorized", 401

    cases = get_tsa_cases()
    target = None

    for c in cases:
        if c.get("id") == case_id:
            target = c
            break

    if not target:
        return jsonify({"error": "Case not found"}), 404

    # Update fields if provided
    if "status" in data:
        target["status"] = data["status"]
    if "notes" in data:
        target["notes"] = data["notes"]

    # Add timeline entry if provided
    if "timeline_entry" in data:
        entry = {
            "timestamp": get_wib_time().strftime("%Y-%m-%d %H:%M:%S"),
            "user": data.get("user", "Unknown"),
            "action": data["timeline_entry"]
        }
        target["timeline"].append(entry)

    save_tsa_cases(cases)
    return jsonify({"status": "success"}), 200
# ==========================================
#     END OF TSA DISCREPANCY TRACKER
# ==========================================

# ==========================================
#     NEW: GOODS IN CUSTODY (LEFTOVERS)
# ==========================================
TSA_CUSTODY_FILE = "tsa_custody.json"

def get_tsa_custody():
    """Bulletproof reader for TSA custody records."""
    if os.path.exists(TSA_CUSTODY_FILE):
        try:
            with open(TSA_CUSTODY_FILE, 'r') as f:
                content = f.read().strip()
                if not content:
                    return []
                return json.loads(content)
        except Exception:
            try: os.remove(TSA_CUSTODY_FILE)
            except: pass
            return []
    return []

def save_tsa_custody(data):
    try:
        with open(TSA_CUSTODY_FILE, 'w') as f:
            json.dump(data, f, indent=4)
    except Exception:
        pass

@app.route('/api/tsa/custody', methods=['GET'])
def get_tsa_custody_route():
    """Fetch all custody records."""
    if request.args.get('admin_key') != ADMIN_SECRET:
        return "Unauthorized", 401
    return jsonify(get_tsa_custody()), 200

@app.route('/api/tsa/custody', methods=['POST'])
def create_tsa_custody_route():
    """Create a new custody record for leftover items."""
    data = request.get_json()
    if not data: return jsonify({"error": "No data"}), 400
    if data.get("admin_key") != ADMIN_SECRET:
        return "Unauthorized", 401

    custody_records = get_tsa_custody()

    # Generate ID
    custody_id = f"CUS-{int(time.time())}"

    new_record = {
        "id": custody_id,
        "item_sku": data.get("item_sku", "Unknown"),
        "quantity": data.get("quantity", 0),
        "date_found": data.get("date_found", get_wib_time().strftime("%Y-%m-%d")),  # NEW: Date Found
        "found_location": data.get("found_location", "Unknown"),
        "reported_by": data.get("reported_by", "Unknown"),
        "status": "OPEN",  # OPEN -> ASSIGNED -> CLEARED -> RETURNED
        "claimed_by_outlet": None,  # NEW: For claiming
        "returned_date": None,  # NEW: For auto-return
        "notes": data.get("notes", ""),
        "created_at": get_wib_time().strftime("%Y-%m-%d %H:%M:%S")
    }

    custody_records.append(new_record)
    save_tsa_custody(custody_records)

    return jsonify({"status": "success", "custody_id": custody_id}), 201

@app.route('/api/tsa/custody/<custody_id>', methods=['PUT'])
def update_tsa_custody_route(custody_id):
    """Update a custody record (assign to outlet, clear, or return to stock)."""
    data = request.get_json()
    if not data: return jsonify({"error": "No data"}), 400
    if data.get("admin_key") != ADMIN_SECRET:
        return "Unauthorized", 401

    custody_records = get_tsa_custody()
    target = None

    for c in custody_records:
        if c.get("id") == custody_id:
            target = c
            break

    if not target:
        return jsonify({"error": "Custody record not found"}), 404

    # Update fields if provided
    if "status" in data:
        old_status = target["status"]
        target["status"] = data["status"]

        # Handle ASSIGNED status
        if data["status"] == "ASSIGNED" and "claimed_by_outlet" in data:
            target["claimed_by_outlet"] = data["claimed_by_outlet"]

        # Handle RETURNED status - add back to stock
        elif data["status"] == "RETURNED":
            target["returned_date"] = get_wib_time().strftime("%Y-%m-%d")

            # Add quantity back to current stock
            try:
                stock_file_path = os.path.join(app.root_path, 'static', 'current_stock.json')
                if os.path.exists(stock_file_path):
                    with open(stock_file_path, 'r') as f:
                        current_stock = json.load(f)

                    sku = target.get("item_sku")
                    qty = target.get("quantity", 0)

                    if sku and qty > 0:
                        current_stock[sku] = current_stock.get(sku, 0) + qty

                        with open(stock_file_path, 'w') as f:
                            json.dump(current_stock, f, indent=4)
            except Exception as e:
                print(f"Error returning to stock: {e}")

    if "claimed_by_outlet" in data:
        target["claimed_by_outlet"] = data["claimed_by_outlet"]
    if "notes" in data:
        target["notes"] = data["notes"]

    save_tsa_custody(custody_records)
    return jsonify({"status": "success"}), 200

@app.route('/api/tsa/custody/process_returns', methods=['POST'])
def process_unclaimed_returns():
    """Auto-return unclaimed custody items from previous month to stock."""
    if request.args.get('admin_key') != ADMIN_SECRET:
        return "Unauthorized", 401

    custody_records = get_tsa_custody()
    current_month = get_wib_time().strftime("%Y-%m")

    returned_count = 0

    for record in custody_records:
        # Check if item is OPEN and from a previous month
        if record.get("status") == "OPEN":
            date_found = record.get("date_found", "")
            if date_found and date_found[:7] < current_month:  # Compare YYYY-MM
                # Mark as RETURNED
                record["status"] = "RETURNED"
                record["returned_date"] = get_wib_time().strftime("%Y-%m-%d")

                # Add quantity back to current stock
                try:
                    stock_file_path = os.path.join(app.root_path, 'static', 'current_stock.json')
                    if os.path.exists(stock_file_path):
                        with open(stock_file_path, 'r') as f:
                            current_stock = json.load(f)

                        sku = record.get("item_sku")
                        qty = record.get("quantity", 0)

                        if sku and qty > 0:
                            current_stock[sku] = current_stock.get(sku, 0) + qty

                            with open(stock_file_path, 'w') as f:
                                json.dump(current_stock, f, indent=4)

                            returned_count += 1
                except Exception as e:
                    print(f"Error returning {sku} to stock: {e}")

    save_tsa_custody(custody_records)
    return jsonify({"status": "success", "returned_count": returned_count}), 200
# ==========================================
#     END OF GOODS IN CUSTODY
# ==========================================

# ==========================================
#     NEW: STAFF PERFORMANCE TRACKER
# ==========================================
STAFF_PERFORMANCE_FILE = "staff_performance.json"

def get_staff_performance():
    """Bulletproof reader for staff performance data."""
    if os.path.exists(STAFF_PERFORMANCE_FILE):
        try:
            with open(STAFF_PERFORMANCE_FILE, 'r') as f:
                content = f.read().strip()
                if not content:
                    return {}
                return json.loads(content)
        except Exception:
            try: os.remove(STAFF_PERFORMANCE_FILE)
            except: pass
            return {}
    return {}

def save_staff_performance(data):
    try:
        with open(STAFF_PERFORMANCE_FILE, 'w') as f:
            json.dump(data, f, indent=4)
    except Exception:
        pass

def get_week_number(date_obj):
    """Returns ISO week number string like '2026-W26'."""
    return date_obj.strftime("%Y-W%W")

@app.route('/api/staff/performance', methods=['GET'])
def get_staff_performance_route():
    """Fetch performance scores. Supports staff_id and date range filters."""
    if request.args.get('admin_key') != ADMIN_SECRET:
        return "Unauthorized", 401

    data = get_staff_performance()
    scores = data.get("scores", {})

    # Filter by staff_id if provided
    staff_id = request.args.get('staff_id')
    if staff_id:
        filtered = {}
        for week, week_data in scores.items():
            if staff_id in week_data:
                filtered[week] = {staff_id: week_data[staff_id]}
        return jsonify(filtered), 200

    # Filter by date range if provided
    start_date = request.args.get('start_date')  # YYYY-MM-DD
    end_date = request.args.get('end_date')
    if start_date and end_date:
        filtered = {}
        for week, week_data in scores.items():
            # Simple week filtering based on year-week format
            if start_date <= week[:10] <= end_date:  # Compare YYYY part
                filtered[week] = week_data
        return jsonify(filtered), 200

    return jsonify(data), 200

@app.route('/api/staff/performance', methods=['POST'])
def save_staff_performance_route():
    """Save weekly performance score for a staff member."""
    data = request.get_json()
    if not data: return jsonify({"error": "No data"}), 400
    if data.get("admin_key") != ADMIN_SECRET:
        return "Unauthorized", 401

    # Required fields
    staff_id = data.get("staff_id")
    name = data.get("name")
    role = data.get("role", "Unknown")
    week = data.get("week")  # e.g., "2026-W26"

    if not all([staff_id, name, week]):
        return jsonify({"error": "Missing required fields: staff_id, name, week"}), 400

    # KPI scores (1-5 each)
    kedisiplinan = data.get("kedisiplinan", 0)
    inisiatif = data.get("inisiatif", 0)
    kerjasama_tim = data.get("kerjasama_tim", 0)
    pemeliharaan_alat = data.get("pemeliharaan_alat", 0)

    # Validate scores
    for score in [kedisiplinan, inisiatif, kerjasama_tim, pemeliharaan_alat]:
        if not (1 <= score <= 5):
            return jsonify({"error": "KPI scores must be between 1 and 5"}), 400

    total = kedisiplinan + inisiatif + kerjasama_tim + pemeliharaan_alat
    notes = data.get("notes", "")
    scored_by = data.get("scored_by", "DC Leader")

    # Load existing data
    perf_data = get_staff_performance()
    if "scores" not in perf_data:
        perf_data["scores"] = {}

    # Add or update the score for this week
    if week not in perf_data["scores"]:
        perf_data["scores"][week] = {}

    perf_data["scores"][week][staff_id] = {
        "name": name,
        "role": role,
        "kedisiplinan": kedisiplinan,
        "inisiatif": inisiatif,
        "kerjasama_tim": kerjasama_tim,
        "pemeliharaan_alat": pemeliharaan_alat,
        "total": total,
        "notes": notes,
        "scored_by": scored_by,
        "scored_at": get_wib_time().strftime("%Y-%m-%d %H:%M:%S")
    }

    save_staff_performance(perf_data)

    # Log to audit trail
    try:
        log_audit("PERFORMANCE_SCORE", f"Scored {name} ({staff_id}) for {week}: {total}/20", user=scored_by, role="DC Leader")
    except:
        pass

    return jsonify({"status": "success", "staff_id": staff_id, "week": week, "total": total}), 200

@app.route('/api/staff/performance/trend', methods=['GET'])
def get_staff_performance_trend():
    """Fetch historical performance scores for a specific staff member (for charts/export)."""
    if request.args.get('admin_key') != ADMIN_SECRET:
        return "Unauthorized", 401

    staff_id = request.args.get('staff_id')
    if not staff_id:
        return jsonify({"error": "Missing staff_id"}), 400

    data = get_staff_performance()
    scores = data.get("scores", {})

    # Collect all scores for this staff member, sorted by week
    trend = []
    for week in sorted(scores.keys()):
        if staff_id in scores[week]:
            entry = scores[week][staff_id]
            trend.append({
                "week": week,
                "total": entry.get("total"),
                "kedisiplinan": entry.get("kedisiplinan"),
                "inisiatif": entry.get("inisiatif"),
                "kerjasama_tim": entry.get("kerjasama_tim"),
                "pemeliharaan_alat": entry.get("pemeliharaan_alat"),
                "notes": entry.get("notes"),
                "scored_by": entry.get("scored_by"),
                "scored_at": entry.get("scored_at")
            })

    # Calculate 4-week rolling average for the latest entry
    if len(trend) >= 4:
        last_4 = [t["total"] for t in trend[-4:]]
        rolling_avg = round(sum(last_4) / 4, 1)
    elif trend:
        rolling_avg = round(sum(t["total"] for t in trend) / len(trend), 1)
    else:
        rolling_avg = None

    return jsonify({
        "staff_id": staff_id,
        "trend": trend,
        "rolling_avg_4w": rolling_avg
    }), 200
# ==========================================
#     END OF STAFF PERFORMANCE TRACKER
# ==========================================

if __name__ == '__main__':
    app.run(debug=True)
