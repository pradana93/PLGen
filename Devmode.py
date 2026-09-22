# offline_pin_generator.py
# =====================================================
#  🔐 JESTA OFFLINE PIN GENERATOR — LEAD DEV ONLY 🔐
#  NEVER distribute this file. It contains the master salt.
#  Always verify license status in the Admin Panel
#  BEFORE sharing a PIN with a terminal.
# =====================================================
import tkinter as tk
from tkinter import ttk, messagebox
import hashlib
import datetime

# ⚠️ MUST MATCH addons.py EXACTLY
MAJESTA_SECRET_SALT = "JESTA_OFFLINE_VAULT_2026"

KNOWN_TERMINALS = {
    "Majesta (Lead Developer)": "8DB7CE3731E42814",
    "Zahra Logistic VT":        "A958AAA787BF6FF9",
    "Nur Logistic VT":          "30EA5F1E9BD8FD68",
}

def generate_offline_pin(hwid, date_str):
    """MUST be identical to the algorithm inside addons.py"""
    raw = f"{hwid}|{date_str}|{MAJESTA_SECRET_SALT}"
    hash_val = hashlib.sha256(raw.encode()).hexdigest()
    digits = "".join(filter(str.isdigit, hash_val))
    return digits[:6].ljust(6, "0")

root = tk.Tk()
root.title("Jesta Offline PIN Generator (DEV ONLY)")
root.geometry("560x500")
root.configure(bg="#2c3e50")
root.resizable(False, False)

tk.Label(root, text="🔐 OFFLINE PIN GENERATOR", font=("Segoe UI", 16, "bold"),
         bg="#2c3e50", fg="#f1c40f").pack(pady=(18, 2))
tk.Label(root, text="PRIVATE LEAD-DEV TOOL — DO NOT DISTRIBUTE\nVerify license status in Admin Panel before sharing a PIN.",
         font=("Segoe UI", 9), bg="#2c3e50", fg="#bdc3c7", justify="center").pack(pady=(0, 14))

panel = tk.Frame(root, bg="#34495e", bd=1, relief="solid")
panel.pack(fill="x", padx=26)

tk.Label(panel, text="Terminal HWID (from the lock screen):", font=("Segoe UI", 10, "bold"),
         bg="#34495e", fg="white").grid(row=0, column=0, sticky="w", padx=12, pady=(12, 4))

hwid_var = tk.StringVar()
hwid_entry = tk.Entry(panel, textvariable=hwid_var, font=("Consolas", 11), width=40,
                      bg="#2c3e50", fg="white", insertbackground="white")
hwid_entry.grid(row=1, column=0, padx=12, pady=(0, 8))

tk.Label(panel, text="...or pick a known terminal:", font=("Segoe UI", 9),
         bg="#34495e", fg="#bdc3c7").grid(row=2, column=0, sticky="w", padx=12)

def pick_terminal(event=None):
    alias = terminal_combo.get()
    if alias in KNOWN_TERMINALS:
        hwid_var.set(KNOWN_TERMINALS[alias])

terminal_combo = ttk.Combobox(panel, values=list(KNOWN_TERMINALS.keys()),
                              state="readonly", width=38)
terminal_combo.grid(row=3, column=0, padx=12, pady=(0, 8))
terminal_combo.bind("<<ComboboxSelected>>", pick_terminal)

result_frame = tk.Frame(root, bg="#2c3e50")
result_frame.pack(fill="x", padx=26, pady=14)

today_lbl = tk.Label(result_frame, text="TODAY PIN: ------", font=("Consolas", 22, "bold"),
                     bg="#2c3e50", fg="#2ecc71")
today_lbl.pack()
yest_lbl = tk.Label(result_frame, text="YESTERDAY (grace): ------", font=("Consolas", 12, "bold"),
                    bg="#2c3e50", fg="#7f8c8d")
yest_lbl.pack(pady=(4, 10))

def copy_pin():
    pin = today_lbl.cget("text").split(":")[-1].strip()
    if pin != "------":
        root.clipboard_clear()
        root.clipboard_append(pin)

def generate():
    hwid = hwid_var.get().strip().upper()
    if len(hwid) != 16:
        messagebox.showerror("Invalid HWID", "HWID must be the 16-character Terminal ID\nshown on the app's lock screen.")
        return
    today = datetime.datetime.now()
    yesterday = today - datetime.timedelta(days=1)
    today_lbl.config(text=f"TODAY PIN: {generate_offline_pin(hwid, today.strftime('%Y%m%d'))}")
    yest_lbl.config(text=f"YESTERDAY (grace): {generate_offline_pin(hwid, yesterday.strftime('%Y%m%d'))}")

tk.Button(panel, text="⚙️ GENERATE PIN", font=("Segoe UI", 11, "bold"),
          bg="#f39c12", fg="white", command=generate).grid(row=4, column=0, pady=(4, 14))
tk.Button(result_frame, text="📋 Copy Today's PIN", command=copy_pin,
          bg="#34495e", fg="white", font=("Segoe UI", 9, "bold")).pack()

root.mainloop()
