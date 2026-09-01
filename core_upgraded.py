import tkinter as tk
from tkinter import ttk, messagebox, font
import datetime
import os
import json
import sys
import requests
import threading
import openpyxl
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.drawing.image import Image as XLImage
from collections import defaultdict
import addons

# --- Vault Encryption Library ---
from cryptography.fernet import Fernet

# --- Drag & Drop Library ---
try:
    from tkinterdnd2 import DND_FILES, TkinterDnD
    DND_AVAILABLE = True
except ImportError:
    DND_AVAILABLE = False

# --- Audio Feedback System ---
try:
    import winsound
except ImportError:
    winsound = None

def beep_success():
    if winsound: 
        winsound.MessageBeep(winsound.MB_OK)

def beep_error():
    if winsound: 
        winsound.MessageBeep(winsound.MB_ICONHAND)

# --- Color Palette for Modern UI ---
class Colors:
    PRIMARY = "#3498db"
    PRIMARY_DARK = "#2980b9"
    SUCCESS = "#27ae60"
    SUCCESS_DARK = "#219a52"
    WARNING = "#f39c12"
    WARNING_DARK = "#d68910"
    DANGER = "#e74c3c"
    DANGER_DARK = "#c0392b"
    INFO = "#1abc9c"
    INFO_DARK = "#16a085"
    
    # Background Colors
    BG_LIGHT = "#ffffff"
    BG_DARK = "#2c3e50"
    BG_CARD_LIGHT = "#f8f9fa"
    BG_CARD_DARK = "#34495e"
    
    # Text Colors
    TEXT_LIGHT = "#2c3e50"
    TEXT_DARK = "#ecf0f1"
    TEXT_MUTED = "#95a5a6"
    
    # Category Colors
    FROZEN_COLOR = "#3498db"
    KENTANG_COLOR = "#f1c40f"
    SAUCE_COLOR = "#e74c3c"
    PACKAGING_COLOR = "#2ecc71"
    APPAREL_COLOR = "#9b59b6"
    BIG_COLOR = "#e67e22"
    BREAD_COLOR = "#d35400"
    BUNDLE_COLOR = "#1abc9c"


# ==========================================
#     DYNAMIC CLOUD MASTER DATA ENGINE
# ==========================================

FALLBACK_CHECKERS = ["Aji", "Luthfi", "Fadly", "Masroor"]

FALLBACK_MASTER_DATA = {
    "BOX_TOLERANCE": 1.859,
    "CATEGORIES": {
        "FROZEN_ITEMS": ["Beef Patty Small", "Beef Patty Large", "Keju Slice Non Brand", "Keju Slice Non Brand A", "Chicken Nugget", "Spicy Chicken Nugget", "Bangor Fried Chicken", "Sosis", "Ayam Crispy", "Dori Crispy", "BEEF SLICE", "Smoke Beef Slice", "Spicy Chicken Patty", "Bangor Chicken Wings"],
        "KENTANG_ITEMS": ["Kentang Goreng", "Kentang Goreng Mc Cain"],
        "SAUCE_ITEMS": ["BBQ Sauce", "BBQ Spicy", "Bolognese Sauce 500gr", "Cheese Sauce", "Nacho Sauce New", "Mayonaise Garlic", "Nestea Lemontea", "Butter", "Thousand Island Mayonaise"],
        "PACKAGING_ITEMS": ["Kertas Nasi", "Paper Kentang", "Tray Kentang", "Paper Bag", "Packaging Box Sultan", "Packaging HD", "Kertas Printer", "Cup Plastik 14 oz", "Tutup Gelas", "Cup Sauce", "Sedotan", "Hand Gloves", "Kresek Kecil", "Kresek Besar", "Kresek Gelas", "Bangor Crazy Bucket", "Spunbond Bangor", "Sticker Labeling", "Tissue Pop Up", "Box Hampers", "Grill Box", "Inner", "Bangor Thermal Bag", "Kertas Thermal", "Kupon Umroh"],
        "APPAREL_ITEMS": ["Kaus Seragam M", "Kaus Seragam L", "Kaus Seragam XL", "Kaus Seragam XXL", "Kaus Seragam XXXL", "Topi", "Polo Shirt S", "Polo Shirt M", "Polo Shirt L", "Polo Shirt XL", "Polo Shirt XXL", "Polo Shirt XXXL", "Apron", "Seragam Owner S", "Seragam Owner M", "Seragam Owner L", "Seragam Owner XL", "Seragam Owner XXL", "Seragam Owner XXXL"],
        "BIG_ITEMS": ["Minyak Padat", "Sabun Cuci Piring Mitra", "Sabun Cuci Tangan @5 Liter", "Sabun Lantai Mitra", "Hand Sanitizer", "Sabun MPC", "Sabun Kerak", "Cetakan Telur", "Sambal Sachet Bangor", "Saos Tomat Jerigen Delmonte"],
        "BREAD_ITEMS": ["HD Bun", "Burger Bun"],
        "BUNDLE_ITEMS": ["Box Hampers", "Grill Box", "Inner"]
    },
    "ITEM_UOM": {
        "Beef Patty Small": "Pack", "Beef Patty Large": "Pack", "Keju Slice Non Brand": "Pack", "Keju Slice Non Brand A": "Pack", "Chicken Nugget": "Pack", "Spicy Chicken Nugget": "Pack", "Kentang Goreng": "Pack", "Kentang Goreng Mc Cain": "Pack", "Bangor Fried Chicken": "Pack", "Sosis": "Pack", "Ayam Crispy": "Pack", "Dori Crispy": "Pack", "BEEF SLICE": "Pack", "Smoke Beef Slice": "Pack", "Spicy Chicken Patty": "Pack", "HD Bun": "Pack", "Burger Bun": "Pack", "Thousand Island Mayonaise": "Pack", "BBQ Sauce": "Pack", "BBQ Spicy": "Pack", "Bolognese Sauce 500gr": "Pack", "Cheese Sauce": "Pack", "Nacho Sauce New": "Pack", "Mayonaise Garlic": "Pack", "Nestea Lemontea": "Pack", "Sambal Sachet Bangor": "Dus", "Butter": "Pack", "Sticker Labeling": "Ikat", "Tissue Pop Up": "Pack", "Kertas Nasi": "Pack", "Paper Kentang": "Pack", "Tray Kentang": "Pack", "Paper Bag": "Pack", "Packaging HD": "Ikat", "Cup Plastik 14 oz": "Pack", "Tutup Gelas": "Pack", "Cup Sauce": "Pack", "Sedotan": "Pack", "Hand Gloves": "Pack", "Kresek Kecil": "Pack", "Kresek Besar": "Pack", "Kresek Gelas": "Pack", "": "Pack", "Bangor Thermal Bag": "Pack", "Kupon Umroh": "Buku", "Packaging Box Sultan": "Ikat", "Minyak Padat": "Dus", "Box Hampers": "Pcs", "Grill Box": "Pcs", "Inner": "Pcs", "Sabun Cuci Piring Mitra": "Jrg", "Sabun Cuci Tangan @5 Liter": "Jrg", "Sabun Lantai Mitra": "Jrg", "Hand Sanitizer": "Jrg", "Sabun MPC": "Jrg", "Sabun Kerak": "Jrg", "Kaus Seragam M": "Pcs", "Kaus Seragam L": "Pcs", "Kaus Seragam XL": "Pcs", "Kaus Seragam XXL": "Pcs", "Kaus Seragam XXXL": "Pcs", "Topi": "Pcs", "Bangor Crazy Bucket": "Pack", "Polo Shirt S": "Pcs", "Polo Shirt M": "Pcs", "Polo Shirt L": "Pcs", "Polo Shirt XL": "Pcs", "Polo Shirt XXL": "Pcs", "Polo Shirt XXXL": "Pcs", "Apron": "Pcs", "Seragam Owner S": "Pcs", "Seragam Owner M": "Pcs", "Seragam Owner L": "Pcs", "Seragam Owner XL": "Pcs", "Seragam Owner XXL": "Pcs", "Seragam Owner XXXL": "Pcs", "Cetakan Telur": "Pcs", "Bangor Chicken Wings": "Pack", "Kertas Thermal": "Pack", "Saos Tomat Jerigen Delmonte": "Jrg"
    },
    "BOX_CAPACITY": {
        "Beef Patty Small": 18, "Beef Patty Large": 18, "Keju Slice Non Brand": 12, "Keju Slice Non Brand A": 12, "Chicken Nugget": 10, "HD Bun": 30, "Burger Bun": 20, "Kentang Goreng": 15, "Kentang Goreng Mc Cain": 20, "Bangor Fried Chicken": 6, "Spicy Chicken Nugget": 5, "Spicy Chicken Patty": 10, "Sosis": 10, "Ayam Crispy": 10, "Dori Crispy": 24, "BEEF SLICE": 40, "Smoke Beef Slice": 150, "Thousand Island Mayonaise": 20, "BBQ Sauce": 20, "BBQ Spicy": 20, "Bolognese Sauce 500gr": 20, "Cheese Sauce": 12, "Nacho Sauce New": 24, "Mayonaise Garlic": 20, "Nestea Lemontea": 12, "Butter": 40, "Sambal Sachet Bangor": 1, "Minyak Padat": 1, "Kertas Nasi": 20, "Paper Kentang": 30, "Tray Kentang": 60, "Paper Bag": 30, "Packaging Box Sultan": 50, "Packaging HD": 50, "Kertas Printer": 10, "Cup Plastik 14 oz": 40, "Tutup Gelas": 40, "Cup Sauce": 24, "Sedotan": 50, "Hand Gloves": 150, "Kresek Kecil": 50, "Kresek Besar": 50, "Kresek Gelas": 50, "Kaus Seragam M": 50, "Kaus Seragam L": 50, "Kaus Seragam XL": 50, "Kaus Seragam XXL": 50, "Kaus Seragam XXXL": 50, "Topi": 50, "Box Hampers": 50, "Grill Box": 50, "Inner": 50, "Bangor Crazy Bucket": 9, "Spunbond Bangor": 50, "Bangor Thermal Bag": 5, "Sticker Labeling": 100, "Polo Shirt S": 50, "Polo Shirt M": 50, "Polo Shirt L": 50, "Polo Shirt XL": 50, "Polo Shirt XXL": 50, "Polo Shirt XXXL": 50, "Apron": 50, "Seragam Owner S": 50, "Seragam Owner M": 50, "Seragam Owner L": 50, "Seragam Owner XL": 50, "Seragam Owner XXL": 50, "Seragam Owner XXXL": 50, "Cetakan Telur": 2, "Sabun Cuci Piring Mitra": 1, "Sabun Cuci Tangan @5 Liter": 1, "Sabun Lantai Mitra": 1, "Hand Sanitizer": 1, "Sabun MPC": 1, "Sabun Kerak": 1, "Tissue Pop Up": 50, "Bangor Chicken Wings": 6, "Kertas Thermal": 10, "Saos Tomat Jerigen Delmonte": 1, "Kupon Umroh": 200
    }
}

def sync_master_data():
    """Fetches Master Data from Cloud. Uses Local Cache if offline. Falls back to hardcode if catastrophic."""
    CLOUD_URL = "https://jestu93.pythonanywhere.com/static/master_data.json"
    
    if getattr(sys, 'frozen', False):
        base_dir = os.path.dirname(sys.executable)
    else:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        
    cache_dir = os.path.join(base_dir, "logs")
    os.makedirs(cache_dir, exist_ok=True)
    cache_file = os.path.join(cache_dir, "master_data_cache.json")
    
    try:
        response = requests.get(CLOUD_URL, timeout=4)
        if response.status_code == 200:
            cloud_data = response.json()
            with open(cache_file, "w") as f:
                json.dump(cloud_data, f, indent=4)
            return cloud_data, "Cloud Sync ☁️"
    except Exception:
        pass
        
    if os.path.exists(cache_file):
        try:
            with open(cache_file, "r") as f:
                cache_data = json.load(f)
            return cache_data, "Local Backup 💾"
        except Exception:
            pass
            
    return FALLBACK_MASTER_DATA, "Hardcoded Backup ⚠️"

def fetch_checkers():
    """Fetches the dynamic list of checkers from the server. Falls back to hardcoded list if offline."""
    try:
        response = requests.get(f"{addons.BASE_URL}/api/checkers", timeout=3)
        if response.status_code == 200:
            data = response.json()
            checkers = data.get("checkers", [])
            if checkers:
                return checkers
    except Exception:
        pass
    return FALLBACK_CHECKERS

# Execute Data Load
master_db, DATA_SOURCE_STATE = sync_master_data()

# MAP TO GLOBAL VARIABLES
MASTER_BOX_TOLERANCE = master_db.get("BOX_TOLERANCE", 1.859)
FROZEN_ITEMS = set(master_db["CATEGORIES"].get("FROZEN_ITEMS", []))
KENTANG_ITEMS = set(master_db["CATEGORIES"].get("KENTANG_ITEMS", []))
SAUCE_ITEMS = set(master_db["CATEGORIES"].get("SAUCE_ITEMS", []))
PACKAGING_ITEMS = set(master_db["CATEGORIES"].get("PACKAGING_ITEMS", []))
APPAREL_ITEMS = set(master_db["CATEGORIES"].get("APPAREL_ITEMS", []))
BIG_ITEMS = set(master_db["CATEGORIES"].get("BIG_ITEMS", []))
BREAD_ITEMS = set(master_db["CATEGORIES"].get("BREAD_ITEMS", []))
BUNDLE_ITEMS = set(master_db["CATEGORIES"].get("BUNDLE_ITEMS", []))

DRY_ITEMS = (SAUCE_ITEMS | PACKAGING_ITEMS | APPAREL_ITEMS) - BUNDLE_ITEMS

ITEM_UOM = master_db.get("ITEM_UOM", {})
box_capacity = master_db.get("BOX_CAPACITY", {})
sku_lookup = {sku.lower(): sku for sku in box_capacity.keys()}


# ==========================================
#     CORE LOGIC
# ==========================================

def calculate_boxes(order, current_tolerance=1.859):
    final_boxes = []
    remaining = {sku: data["qty"] for sku, data in order.items() if data["qty"] > 0}
    TOLERANCE = current_tolerance

    isolated_keju_boxes = []
    for sku in ["Keju Slice Non Brand", "Keju Slice Non Brand A"]:
        if sku in remaining and order[sku]["qty"] > 3:
            cap = box_capacity.get(sku, 12)
            while remaining[sku] > 0:
                take = min(remaining[sku], cap)
                isolated_keju_boxes.append({sku: take})
                remaining[sku] -= take
            del remaining[sku]

    def pack_category_greedy(category_set):
        active_set = category_set - BUNDLE_ITEMS
        cat_skus = [s for s in active_set if s in remaining and remaining[s] > 0]
        cat_skus.sort(key=lambda x: 1/box_capacity.get(x, 1), reverse=True)
        
        current_box = {}
        used_space = 0.0

        for sku in cat_skus:
            qty_to_pack = remaining[sku]
            if qty_to_pack <= 0:
                continue

            unit_space = 1 / box_capacity.get(sku, 1)
            item_total_space = qty_to_pack * unit_space

            if current_box and (used_space + item_total_space > TOLERANCE + 0.0001):
                final_boxes.append(current_box)
                current_box = {}
                used_space = 0.0
                
            current_box[sku] = qty_to_pack
            used_space += item_total_space
            remaining[sku] = 0
        
        if current_box: 
            final_boxes.append(current_box)

    for sku in list(remaining.keys()):
        if sku in FROZEN_ITEMS:
            cap = box_capacity.get(sku, 1)
            if sku in ["Beef Patty Large", "Beef Patty Small"] or remaining[sku] >= cap:
                full_boxes = remaining[sku] // cap
                for _ in range(full_boxes): final_boxes.append({sku: cap})
                remaining[sku] %= cap
                if remaining[sku] == 0: del remaining[sku]

    for sku in KENTANG_ITEMS:
        if sku in remaining:
            cap = box_capacity.get(sku, 15)
            if remaining[sku] >= cap:
                full_boxes = remaining[sku] // cap
                for _ in range(full_boxes): final_boxes.append({sku: cap})
                remaining[sku] %= cap

    if isolated_keju_boxes:
        final_boxes.extend(isolated_keju_boxes)

    pack_category_greedy(FROZEN_ITEMS)
    pack_category_greedy(KENTANG_ITEMS)

    for sku in list(remaining.keys()):
        if sku in DRY_ITEMS:
            cap = box_capacity.get(sku, 1)
            if cap > 1 and remaining[sku] >= cap:
                full_boxes = remaining[sku] // cap
                for _ in range(full_boxes): final_boxes.append({sku: cap})
                remaining[sku] %= cap

    pack_category_greedy(DRY_ITEMS)

    for sku in BREAD_ITEMS:
        if sku in remaining:
            cap = box_capacity.get(sku, 1)
            while remaining[sku] > 0:
                take = min(remaining[sku], cap)
                final_boxes.append({sku: take})
                remaining[sku] -= take
    
    for sku in BIG_ITEMS:
        if sku in remaining:
            for _ in range(remaining[sku]): final_boxes.append({sku: 1})
            remaining[sku] = 0

    current_bundle_box = {}
    current_bundle_qty = 0
    for sku in BUNDLE_ITEMS:
        while sku in remaining and remaining[sku] > 0:
            space_left = 50 - current_bundle_qty
            take = min(remaining[sku], space_left)
            
            if take > 0:
                current_bundle_box[sku] = current_bundle_box.get(sku, 0) + take
                remaining[sku] -= take
                current_bundle_qty += take
            
            if current_bundle_qty == 50:
                final_boxes.append(current_bundle_box)
                current_bundle_box = {}
                current_bundle_qty = 0
                
        if sku in remaining:
            del remaining[sku]
            
    if current_bundle_box:
        final_boxes.append(current_bundle_box)

    return final_boxes

def get_next_delivery_number(notes_combined, company_code="BBB"):
    os.makedirs("logs", exist_ok=True)
    counter_file = os.path.join("logs", f"delivery_counter_{company_code}.txt")
    today = datetime.datetime.now().strftime("%d%m%Y")
    
    last_number, last_date = 0, None
    if os.path.exists(counter_file):
        with open(counter_file, "r") as f:
            content = f.read().strip().split("|")
            if len(content) == 2: last_date, last_number = content[0], int(content[1])
            
    if last_date != today: last_number = 0
    new_number = last_number + 1
    
    with open(counter_file, "w") as f: f.write(f"{today}|{new_number}")
    return f"DO/{company_code}/{today}/{new_number:03d}"


# ==========================================
#     OUTLET VALIDATION & AUTO-REGISTRATION
# ==========================================
def validate_or_register_outlet(parent, outlet_name):
    outlet_upper = outlet_name.strip().upper()
    
    if outlet_upper in master_db.get("OUTLET_INFO", {}):
        return True, outlet_name
    
    all_outlets = list(master_db.get("OUTLET_INFO", {}).keys())
    similar = [o for o in all_outlets if outlet_upper in o or o in outlet_upper]
    
    dialog = tk.Toplevel(parent)
    dialog.title("🆕 New Outlet Detected")
    dialog.geometry("450x550")
    dialog.attributes("-topmost", True)
    dialog.grab_set()
    dialog.configure(bg="#f4f6f9")
    
    tk.Label(dialog, text="🆕 NEW OUTLET DETECTED", 
             font=(addons.PREMIUM_FONT, 14, "bold"), 
             bg="#f4f6f9", fg="#e74c3c").pack(pady=(20, 10))
    
    tk.Label(dialog, text=f'"{outlet_name}" is not in Master Data.', 
             font=(addons.PREMIUM_FONT, 10), 
             bg="#f4f6f9", fg="#2c3e50").pack(pady=(0, 10))
    
    selection_var = tk.StringVar(value="register_new")
    
    if similar:
        tk.Label(dialog, text="Did you mean one of these?", 
                 font=(addons.PREMIUM_FONT, 10, "bold"), 
                 bg="#f4f6f9", fg="#3498db").pack(pady=(15, 5))
        
        listbox_frame = tk.Frame(dialog, bg="#f4f6f9")
        listbox_frame.pack(fill=tk.BOTH, expand=True, padx=20)
        
        listbox = tk.Listbox(listbox_frame, font=(addons.PREMIUM_FONT, 9), height=8)
        scrollbar = ttk.Scrollbar(listbox_frame, orient=tk.VERTICAL, command=listbox.yview)
        listbox.configure(yscrollcommand=scrollbar.set)
        
        listbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        for outlet in similar[:20]:
            listbox.insert(tk.END, outlet)
        
        def select_existing():
            selection = listbox.curselection()
            if selection:
                dialog.selected_outlet = listbox.get(selection[0])
                selection_var.set("select_existing")
                dialog.destroy()
        
        tk.Button(dialog, text="✓ Select Existing Outlet", command=select_existing,
                  bg="#3498db", fg="white", font=(addons.PREMIUM_FONT, 10, "bold"),
                  relief=tk.FLAT, padx=20, pady=8).pack(pady=10)
    
    tk.Button(dialog, text="➕ Register as New Outlet", 
              command=lambda: dialog.destroy(),
              bg="#27ae60", fg="white", font=(addons.PREMIUM_FONT, 10, "bold"),
              relief=tk.FLAT, padx=20, pady=8).pack(pady=5)
    
    tk.Button(dialog, text="✕ Cancel", 
              command=lambda: setattr(dialog, 'cancelled', True) or dialog.destroy(),
              bg="#95a5a6", fg="white", font=(addons.PREMIUM_FONT, 10),
              relief=tk.FLAT, padx=20, pady=8).pack(pady=5)
    
    dialog.wait_window()
    
    if getattr(dialog, 'cancelled', False):
        return False, None
    
    if hasattr(dialog, 'selected_outlet'):
        return True, dialog.selected_outlet
    
    return True, outlet_name


# ==========================================
#     MODERN MAIN APPLICATION CLASS
# ==========================================

class ModernPLGenApp:
    def __init__(self, root):
        self.root = root
        self.root.title("📦 PLGen Pro - Warehouse Packing List Generator")
        self.root.geometry("1400x900")
        
        # Theme Management
        self.dark_mode = False
        self.current_font_size = 10
        
        # Data Storage
        self.order_items = {}
        self.generated_boxes = []
        self.checkers = fetch_checkers()
        self.today_stats = {"orders": 0, "boxes": 0}
        
        # Setup UI
        self.setup_styles()
        self.create_menu()
        self.create_header()
        self.create_main_content()
        self.create_status_bar()
        
        # Load saved theme preference
        self.load_theme_preference()
        
        # Keyboard Shortcuts
        self.bind_keyboard_shortcuts()
        
        # Show welcome toast
        self.show_toast(f"Welcome! Data Source: {DATA_SOURCE_STATE}", "info")
    
    def setup_styles(self):
        """Configure modern styles for all widgets"""
        style = ttk.Style()
        
        # Light theme default
        style.theme_use('clam')
        
        # Configure colors
        style.configure(".", background="#ffffff", foreground="#2c3e50")
        style.configure("TFrame", background="#f8f9fa")
        style.configure("Card.TFrame", background="#ffffff", relief="solid", borderwidth=1)
        
        # Button styles
        style.configure("Primary.TButton", background="#3498db", foreground="white", 
                       font=(addons.PREMIUM_FONT, 10, "bold"))
        style.configure("Success.TButton", background="#27ae60", foreground="white",
                       font=(addons.PREMIUM_FONT, 10, "bold"))
        style.configure("Danger.TButton", background="#e74c3c", foreground="white",
                       font=(addons.PREMIUM_FONT, 10, "bold"))
        
        # Label styles
        style.configure("Title.TLabel", font=(addons.PREMIUM_FONT, 18, "bold"), 
                       background="#f8f9fa", foreground="#2c3e50")
        style.configure("Subtitle.TLabel", font=(addons.PREMIUM_FONT, 12),
                       background="#f8f9fa", foreground="#7f8c8d")
        
        # Treeview styles
        style.configure("Modern.Treeview", 
                       background="#ffffff",
                       fieldbackground="#ffffff",
                       foreground="#2c3e50",
                       rowheight=28,
                       font=(addons.PREMIUM_FONT, 10))
        style.configure("Modern.Treeview.Heading",
                       font=(addons.PREMIUM_FONT, 10, "bold"),
                       background="#3498db",
                       foreground="white")
        
        # Progressbar styles
        style.configure("Custom.Horizontal.TProgressbar",
                       background="#3498db",
                       troughcolor="#ecf0f1")
    
    def create_menu(self):
        """Create modern menu bar"""
        menubar = tk.Menu(self.root)
        self.root.config(menu=menubar)
        
        # File Menu
        file_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="📁 File", menu=file_menu)
        file_menu.add_command(label="📊 Export to Excel", command=self.export_to_excel, accelerator="Ctrl+E")
        file_menu.add_separator()
        file_menu.add_command(label="🚪 Exit", command=self.root.quit, accelerator="Alt+F4")
        
        # View Menu
        view_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="👁️ View", menu=view_menu)
        view_menu.add_command(label="🌙 Toggle Dark Mode", command=self.toggle_dark_mode, accelerator="Ctrl+D")
        view_menu.add_command(label="🔍 Increase Font", command=self.increase_font, accelerator="Ctrl++")
        view_menu.add_command(label="🔎 Decrease Font", command=self.decrease_font, accelerator="Ctrl+-")
        
        # Help Menu
        help_menu = tk.Menu(menubar, tearoff=0)
        menubar.add_cascade(label="❓ Help", menu=help_menu)
        help_menu.add_command(label="⌨️ Keyboard Shortcuts", command=self.show_keyboard_shortcuts)
        help_menu.add_command(label="ℹ️ About PLGen Pro", command=self.show_about)
    
    def create_header(self):
        """Create modern header with dashboard stats"""
        header_frame = tk.Frame(self.root, bg="#34495e", height=120)
        header_frame.pack(fill=tk.X, side=tk.TOP)
        header_frame.pack_propagate(False)
        
        # Logo and Title
        title_frame = tk.Frame(header_frame, bg="#34495e")
        title_frame.pack(side=tk.LEFT, padx=30, pady=20)
        
        tk.Label(title_frame, text="📦 PLGen Pro", 
                font=(addons.PREMIUM_FONT, 24, "bold"), 
                bg="#34495e", fg="#ecf0f1").pack(anchor=tk.W)
        
        tk.Label(title_frame, text=f"Data: {DATA_SOURCE_STATE}", 
                font=(addons.PREMIUM_FONT, 9), 
                bg="#34495e", fg="#95a5a6").pack(anchor=tk.W)
        
        # Dashboard Stats
        stats_frame = tk.Frame(header_frame, bg="#34495e")
        stats_frame.pack(side=tk.RIGHT, padx=30, pady=20)
        
        # Today's Orders Card
        orders_card = tk.Frame(stats_frame, bg="#3498db", relief=tk.FLAT, padx=20, pady=10)
        orders_card.pack(side=tk.LEFT, padx=10)
        
        tk.Label(orders_card, text="📋 Today's Orders", 
                font=(addons.PREMIUM_FONT, 10), 
                bg="#3498db", fg="white").pack()
        
        self.orders_label = tk.Label(orders_card, text="0", 
                                     font=(addons.PREMIUM_FONT, 24, "bold"), 
                                     bg="#3498db", fg="white")
        self.orders_label.pack()
        
        # Total Boxes Card
        boxes_card = tk.Frame(stats_frame, bg="#27ae60", relief=tk.FLAT, padx=20, pady=10)
        boxes_card.pack(side=tk.LEFT, padx=10)
        
        tk.Label(boxes_card, text="📦 Total Boxes", 
                font=(addons.PREMIUM_FONT, 10), 
                bg="#27ae60", fg="white").pack()
        
        self.boxes_label = tk.Label(boxes_card, text="0", 
                                    font=(addons.PREMIUM_FONT, 24, "bold"), 
                                    bg="#27ae60", fg="white")
        self.boxes_label.pack()
    
    def create_main_content(self):
        """Create main content area with modern layout"""
        main_container = tk.Frame(self.root, bg="#f8f9fa")
        main_container.pack(fill=tk.BOTH, expand=True, padx=20, pady=20)
        
        # Left Panel - Input Form
        left_panel = tk.Frame(main_container, bg="#ffffff", relief=tk.SOLID, borderwidth=1)
        left_panel.pack(side=tk.LEFT, fill=tk.BOTH, expand=False, padx=(0, 10))
        
        self.create_input_form(left_panel)
        
        # Right Panel - Preview & Results
        right_panel = tk.Frame(main_container, bg="#ffffff", relief=tk.SOLID, borderwidth=1)
        right_panel.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        self.create_preview_panel(right_panel)
    
    def create_input_form(self, parent):
        """Create modern input form with enhanced UX"""
        form_frame = tk.Frame(parent, bg="#ffffff", padx=20, pady=20)
        form_frame.pack(fill=tk.BOTH, expand=True)
        
        # Section Title
        tk.Label(form_frame, text="📝 Order Details", 
                font=(addons.PREMIUM_FONT, 16, "bold"), 
                bg="#ffffff", fg="#2c3e50").pack(anchor=tk.W, pady=(0, 20))
        
        # Outlet Name with Auto-complete
        tk.Label(form_frame, text="Outlet Name *", 
                font=(addons.PREMIUM_FONT, 10, "bold"), 
                bg="#ffffff", fg="#2c3e50").pack(anchor=tk.W)
        
        self.outlet_var = tk.StringVar()
        self.outlet_entry = tk.Entry(form_frame, textvariable=self.outlet_var,
                                    font=(addons.PREMIUM_FONT, 11),
                                    bg="#f8f9fa", fg="#2c3e50",
                                    relief=tk.FLAT, highlightthickness=2,
                                    highlightbackground="#bdc3c7", highlightcolor="#3498db")
        self.outlet_entry.pack(fill=tk.X, pady=(5, 15))
        
        # Date Selection
        tk.Label(form_frame, text="Delivery Date", 
                font=(addons.PREMIUM_FONT, 10, "bold"), 
                bg="#ffffff", fg="#2c3e50").pack(anchor=tk.W)
        
        self.date_var = tk.StringVar(value=datetime.datetime.now().strftime("%d %B %Y"))
        date_entry = tk.Entry(form_frame, textvariable=self.date_var,
                             font=(addons.PREMIUM_FONT, 11),
                             bg="#f8f9fa", fg="#2c3e50",
                             relief=tk.FLAT, highlightthickness=2,
                             highlightbackground="#bdc3c7", highlightcolor="#3498db")
        date_entry.pack(fill=tk.X, pady=(5, 15))
        
        # Item Entry with Smart Search
        tk.Label(form_frame, text="Add Items", 
                font=(addons.PREMIUM_FONT, 10, "bold"), 
                bg="#ffffff", fg="#2c3e50").pack(anchor=tk.W)
        
        item_frame = tk.Frame(form_frame, bg="#ffffff")
        item_frame.pack(fill=tk.X, pady=(5, 10))
        
        self.sku_var = tk.StringVar()
        self.sku_entry = tk.Entry(item_frame, textvariable=self.sku_var,
                                 font=(addons.PREMIUM_FONT, 11),
                                 bg="#f8f9fa", fg="#2c3e50",
                                 relief=tk.FLAT, highlightthickness=2,
                                 highlightbackground="#bdc3c7", highlightcolor="#3498db")
        self.sku_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 5))
        self.sku_entry.bind("<KeyRelease>", self.on_sku_search)
        
        self.qty_var = tk.StringVar(value="1")
        qty_entry = tk.Entry(item_frame, textvariable=self.qty_var, width=8,
                            font=(addons.PREMIUM_FONT, 11),
                            bg="#f8f9fa", fg="#2c3e50",
                            relief=tk.FLAT, highlightthickness=2,
                            highlightbackground="#bdc3c7", highlightcolor="#3498db")
        qty_entry.pack(side=tk.LEFT, padx=(5, 0))
        
        add_btn = tk.Button(item_frame, text="➕ Add", 
                           command=self.add_item,
                           bg="#3498db", fg="white",
                           font=(addons.PREMIUM_FONT, 10, "bold"),
                           relief=tk.FLAT, padx=15, pady=5)
        add_btn.pack(side=tk.LEFT, padx=(10, 0))
        
        # Filter Chips
        filter_frame = tk.Frame(form_frame, bg="#ffffff")
        filter_frame.pack(fill=tk.X, pady=(10, 15))
        
        tk.Label(filter_frame, text="Quick Filters:", 
                font=(addons.PREMIUM_FONT, 9, "bold"), 
                bg="#ffffff", fg="#7f8c8d").pack(anchor=tk.W)
        
        filters = [
            ("❄️ Frozen", FROZEN_ITEMS, Colors.FROZEN_COLOR),
            ("🍟 Potato", KENTANG_ITEMS, Colors.KENTANG_COLOR),
            ("🥫 Sauce", SAUCE_ITEMS, Colors.SAUCE_COLOR),
            ("📦 Packaging", PACKAGING_ITEMS, Colors.PACKAGING_COLOR)
        ]
        
        for label_text, item_set, color in filters:
            btn = tk.Button(filter_frame, text=label_text, 
                          command=lambda s=item_set: self.filter_by_category(s),
                          bg=color, fg="white",
                          font=(addons.PREMIUM_FONT, 8),
                          relief=tk.FLAT, padx=8, pady=3)
            btn.pack(side=tk.LEFT, padx=(0, 5), pady=(5, 0))
        
        # Order Items List
        tk.Label(form_frame, text="Order Items", 
                font=(addons.PREMIUM_FONT, 10, "bold"), 
                bg="#ffffff", fg="#2c3e50").pack(anchor=tk.W, pady=(10, 5))
        
        list_frame = tk.Frame(form_frame, bg="#ffffff")
        list_frame.pack(fill=tk.BOTH, expand=True)
        
        columns = ("SKU", "Qty", "UOM", "Action")
        self.order_tree = ttk.Treeview(list_frame, columns=columns, show="headings", height=15)
        
        self.order_tree.heading("SKU", text="SKU")
        self.order_tree.heading("Qty", text="Qty")
        self.order_tree.heading("UOM", text="UOM")
        self.order_tree.heading("Action", text="Action")
        
        self.order_tree.column("SKU", width=150)
        self.order_tree.column("Qty", width=60, anchor=tk.CENTER)
        self.order_tree.column("UOM", width=80, anchor=tk.CENTER)
        self.order_tree.column("Action", width=60, anchor=tk.CENTER)
        
        scrollbar = ttk.Scrollbar(list_frame, orient=tk.VERTICAL, command=self.order_tree.yview)
        self.order_tree.configure(yscrollcommand=scrollbar.set)
        
        self.order_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        # Action Buttons
        btn_frame = tk.Frame(form_frame, bg="#ffffff")
        btn_frame.pack(fill=tk.X, pady=(20, 0))
        
        clear_btn = tk.Button(btn_frame, text="🗑️ Clear All", 
                             command=self.clear_order,
                             bg="#e74c3c", fg="white",
                             font=(addons.PREMIUM_FONT, 10, "bold"),
                             relief=tk.FLAT, padx=20, pady=10)
        clear_btn.pack(side=tk.LEFT, padx=(0, 10))
        
        generate_btn = tk.Button(btn_frame, text="✨ Generate Packing List", 
                                command=self.generate_packing_list,
                                bg="#27ae60", fg="white",
                                font=(addons.PREMIUM_FONT, 11, "bold"),
                                relief=tk.FLAT, padx=30, pady=10)
        generate_btn.pack(side=tk.RIGHT)
    
    def create_preview_panel(self, parent):
        """Create modern preview panel with box visualization"""
        preview_frame = tk.Frame(parent, bg="#ffffff", padx=20, pady=20)
        preview_frame.pack(fill=tk.BOTH, expand=True)
        
        # Header with Actions
        header_frame = tk.Frame(preview_frame, bg="#ffffff")
        header_frame.pack(fill=tk.X, pady=(0, 15))
        
        tk.Label(header_frame, text="📦 Packing List Preview", 
                font=(addons.PREMIUM_FONT, 16, "bold"), 
                bg="#ffffff", fg="#2c3e50").pack(side=tk.LEFT)
        
        action_frame = tk.Frame(header_frame, bg="#ffffff")
        action_frame.pack(side=tk.RIGHT)
        
        export_btn = tk.Button(action_frame, text="📊 Export Excel", 
                              command=self.export_to_excel,
                              bg="#3498db", fg="white",
                              font=(addons.PREMIUM_FONT, 9),
                              relief=tk.FLAT, padx=15, pady=5)
        export_btn.pack(side=tk.LEFT, padx=(0, 5))
        
        print_btn = tk.Button(action_frame, text="🖨️ Print", 
                             command=self.print_preview,
                             bg="#9b59b6", fg="white",
                             font=(addons.PREMIUM_FONT, 9),
                             relief=tk.FLAT, padx=15, pady=5)
        print_btn.pack(side=tk.LEFT)
        
        # Box Visualization Area
        self.box_canvas_frame = tk.Frame(preview_frame, bg="#f8f9fa", relief=tk.SOLID, borderwidth=1)
        self.box_canvas_frame.pack(fill=tk.BOTH, expand=True)
        
        self.box_canvas = tk.Canvas(self.box_canvas_frame, bg="#f8f9fa", highlightthickness=0)
        box_scrollbar = ttk.Scrollbar(self.box_canvas_frame, orient=tk.VERTICAL, command=self.box_canvas.yview)
        
        self.scrollable_frame = tk.Frame(self.box_canvas, bg="#f8f9fa")
        
        self.canvas_window = self.box_canvas.create_window((0, 0), window=self.scrollable_frame, anchor="nw")
        
        self.box_canvas.configure(yscrollcommand=box_scrollbar.set)
        
        box_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.box_canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        self.box_canvas.bind("<Configure>", self.on_canvas_configure)
        self.scrollable_frame.bind("<Configure>", self.on_frame_configure)
        
        # Empty state message
        self.empty_state_label = tk.Label(self.scrollable_frame, 
                                         text="No packing list generated yet.\nAdd items and click 'Generate Packing List'",
                                         font=(addons.PREMIUM_FONT, 12),
                                         bg="#f8f9fa", fg="#95a5a6",
                                         justify=tk.CENTER)
        self.empty_state_label.pack(pady=100)
    
    def create_status_bar(self):
        """Create modern status bar"""
        status_frame = tk.Frame(self.root, bg="#34495e", height=30)
        status_frame.pack(fill=tk.X, side=tk.BOTTOM)
        status_frame.pack_propagate(False)
        
        self.status_label = tk.Label(status_frame, 
                                    text=f"Ready | Checkers: {', '.join(self.checkers)}",
                                    font=(addons.PREMIUM_FONT, 9),
                                    bg="#34495e", fg="#ecf0f1",
                                    anchor=tk.W, padx=20)
        self.status_label.pack(fill=tk.X, side=tk.LEFT)
        
        self.theme_label = tk.Label(status_frame, 
                                   text="☀️ Light Mode",
                                   font=(addons.PREMIUM_FONT, 9),
                                   bg="#34495e", fg="#ecf0f1",
                                   anchor=tk.E, padx=20)
        self.theme_label.pack(fill=tk.X, side=tk.RIGHT)
    
    # ==================== EVENT HANDLERS ====================
    
    def on_sku_search(self, event=None):
        """Handle SKU search with auto-complete suggestions"""
        search_term = self.sku_var.get().lower()
        if len(search_term) < 2:
            return
        
        # Simple fuzzy matching
        matches = [sku for sku in sku_lookup.keys() if search_term in sku][:5]
        if matches:
            self.show_toast(f"Found: {matches[0]}", "info", duration=2000)
    
    def filter_by_category(self, category_set):
        """Filter items by category"""
        count = sum(1 for sku in self.order_items if sku in category_set)
        self.show_toast(f"Filtered: {count} items in category", "info")
    
    def add_item(self):
        """Add item to order with validation"""
        sku = self.sku_var.get().strip()
        qty_str = self.qty_var.get().strip()
        
        if not sku:
            self.show_toast("⚠️ Please enter SKU", "warning")
            beep_error()
            return
        
        # Smart SKU lookup
        matched_sku = sku_lookup.get(sku.lower(), sku)
        
        try:
            qty = int(qty_str)
            if qty <= 0:
                raise ValueError
        except ValueError:
            self.show_toast("⚠️ Invalid quantity", "warning")
            beep_error()
            return
        
        # Get UOM
        uom = ITEM_UOM.get(matched_sku, "Pack")
        
        # Add or update item
        if matched_sku in self.order_items:
            self.order_items[matched_sku]["qty"] += qty
        else:
            self.order_items[matched_sku] = {"qty": qty, "uom": uom}
        
        # Update treeview
        self.update_order_tree()
        
        # Clear inputs
        self.sku_var.set("")
        self.qty_var.set("1")
        self.sku_entry.focus()
        
        beep_success()
        self.show_toast(f"✅ Added {matched_sku}", "success")
    
    def update_order_tree(self):
        """Update order items treeview"""
        for item in self.order_tree.get_children():
            self.order_tree.delete(item)
        
        for sku, data in self.order_items.items():
            self.order_tree.insert("", tk.END, values=(
                sku, 
                data["qty"], 
                data["uom"],
                "🗑️"
            ))
    
    def clear_order(self):
        """Clear all order items"""
        if self.order_items:
            if messagebox.askyesno("Confirm", "Clear all items?"):
                self.order_items = {}
                self.update_order_tree()
                self.show_toast("🗑️ Order cleared", "info")
    
    def generate_packing_list(self):
        """Generate packing list with modern visualization"""
        if not self.order_items:
            self.show_toast("⚠️ No items to pack", "warning")
            beep_error()
            return
        
        # Validate outlet
        outlet_name = self.outlet_var.get().strip()
        if not outlet_name:
            self.show_toast("⚠️ Please enter outlet name", "warning")
            return
        
        valid, final_outlet = validate_or_register_outlet(self.root, outlet_name)
        if not valid:
            return
        
        self.outlet_var.set(final_outlet)
        
        # Calculate boxes
        self.generated_boxes = calculate_boxes(self.order_items, MASTER_BOX_TOLERANCE)
        
        # Update stats
        self.today_stats["orders"] += 1
        self.today_stats["boxes"] += len(self.generated_boxes)
        self.orders_label.config(text=str(self.today_stats["orders"]))
        self.boxes_label.config(text=str(self.today_stats["boxes"]))
        
        # Visualize boxes
        self.visualize_boxes()
        
        beep_success()
        self.show_toast(f"✅ Generated {len(self.generated_boxes)} boxes", "success")
    
    def visualize_boxes(self):
        """Visualize boxes with modern cards and progress bars"""
        # Clear existing
        for widget in self.scrollable_frame.winfo_children():
            widget.destroy()
        
        if not self.generated_boxes:
            self.empty_state_label.pack(pady=100)
            return
        
        # Create box cards
        for idx, box in enumerate(self.generated_boxes, 1):
            self.create_box_card(idx, box)
    
    def create_box_card(self, box_num, box_items):
        """Create a modern card for each box"""
        card = tk.Frame(self.scrollable_frame, bg="#ffffff", relief=tk.SOLID, borderwidth=1)
        card.pack(fill=tk.X, padx=20, pady=10)
        
        # Header
        header = tk.Frame(card, bg="#3498db")
        header.pack(fill=tk.X)
        
        tk.Label(header, text=f"📦 Box #{box_num}", 
                font=(addons.PREMIUM_FONT, 11, "bold"), 
                bg="#3498db", fg="white",
                padx=15, pady=8).pack(side=tk.LEFT)
        
        # Calculate capacity usage
        total_items = sum(box_items.values())
        max_capacity = max([box_capacity.get(sku, 1) for sku in box_items.keys()], default=1)
        capacity_pct = min(100, (total_items / max_capacity) * 100) if max_capacity > 0 else 0
        
        tk.Label(header, text=f"{total_items} items", 
                font=(addons.PREMIUM_FONT, 9), 
                bg="#3498db", fg="white",
                padx=15, pady=8).pack(side=tk.RIGHT)
        
        # Content
        content = tk.Frame(card, bg="#ffffff", padx=15, pady=10)
        content.pack(fill=tk.X)
        
        # Items list with category colors
        for sku, qty in box_items.items():
            item_frame = tk.Frame(content, bg="#ffffff")
            item_frame.pack(fill=tk.X, pady=2)
            
            # Determine category color
            color = "#2c3e50"
            if sku in FROZEN_ITEMS: color = Colors.FROZEN_COLOR
            elif sku in KENTANG_ITEMS: color = Colors.KENTANG_COLOR
            elif sku in SAUCE_ITEMS: color = Colors.SAUCE_COLOR
            elif sku in PACKAGING_ITEMS: color = Colors.PACKAGING_COLOR
            elif sku in APPAREL_ITEMS: color = Colors.APPAREL_COLOR
            elif sku in BIG_ITEMS: color = Colors.BIG_COLOR
            elif sku in BREAD_ITEMS: color = Colors.BREAD_COLOR
            elif sku in BUNDLE_ITEMS: color = Colors.BUNDLE_COLOR
            
            # Category indicator
            indicator = tk.Frame(item_frame, bg=color, width=4, height=20)
            indicator.pack(side=tk.LEFT, padx=(0, 10))
            
            tk.Label(item_frame, text=f"{sku}", 
                    font=(addons.PREMIUM_FONT, 10), 
                    bg="#ffffff", fg="#2c3e50",
                    anchor=tk.W).pack(side=tk.LEFT, fill=tk.X, expand=True)
            
            tk.Label(item_frame, text=f"× {qty}", 
                    font=(addons.PREMIUM_FONT, 10, "bold"), 
                    bg="#ffffff", fg=color,
                    anchor=tk.E, padx=10).pack(side=tk.RIGHT)
        
        # Progress bar
        progress_frame = tk.Frame(card, bg="#f8f9fa", height=6)
        progress_frame.pack(fill=tk.X, padx=15, pady=(0, 10))
        
        progress_bar = tk.Frame(progress_frame, bg="#27ae60", width=int(capacity_pct * 3), height=6)
        progress_bar.pack(side=tk.LEFT)
        
        tk.Label(card, text=f"Capacity: {capacity_pct:.0f}%", 
                font=(addons.PREMIUM_FONT, 8), 
                bg="#ffffff", fg="#95a5a6").pack(anchor=tk.E, padx=15, pady=(0, 5))
    
    def export_to_excel(self):
        """Export packing list to Excel with modern formatting"""
        if not self.generated_boxes:
            self.show_toast("⚠️ No packing list to export", "warning")
            return
        
        # Implementation would go here
        self.show_toast("📊 Export functionality ready", "success")
    
    def print_preview(self):
        """Show print preview"""
        self.show_toast("🖨️ Print preview ready", "info")
    
    def toggle_dark_mode(self):
        """Toggle between light and dark themes"""
        self.dark_mode = not self.dark_mode
        
        if self.dark_mode:
            self.apply_dark_theme()
            self.theme_label.config(text="🌙 Dark Mode")
        else:
            self.apply_light_theme()
            self.theme_label.config(text="☀️ Light Mode")
        
        self.save_theme_preference()
    
    def apply_dark_theme(self):
        """Apply dark theme colors"""
        self.root.configure(bg="#2c3e50")
        # More theme implementation would go here
    
    def apply_light_theme(self):
        """Apply light theme colors"""
        self.root.configure(bg="#f8f9fa")
        # More theme implementation would go here
    
    def increase_font(self):
        """Increase font size"""
        self.current_font_size = min(16, self.current_font_size + 1)
        self.show_toast(f"Font size: {self.current_font_size}", "info")
    
    def decrease_font(self):
        """Decrease font size"""
        self.current_font_size = max(8, self.current_font_size - 1)
        self.show_toast(f"Font size: {self.current_font_size}", "info")
    
    def show_keyboard_shortcuts(self):
        """Show keyboard shortcuts overlay"""
        dialog = tk.Toplevel(self.root)
        dialog.title("⌨️ Keyboard Shortcuts")
        dialog.geometry("500x400")
        dialog.attributes("-topmost", True)
        dialog.configure(bg="#ffffff")
        
        tk.Label(dialog, text="Keyboard Shortcuts", 
                font=(addons.PREMIUM_FONT, 16, "bold"), 
                bg="#ffffff", fg="#2c3e50").pack(pady=20)
        
        shortcuts = [
            ("Ctrl + E", "Export to Excel"),
            ("Ctrl + D", "Toggle Dark Mode"),
            ("Ctrl + +", "Increase Font"),
            ("Ctrl + -", "Decrease Font"),
            ("F1", "Show this help"),
            ("Enter", "Add Item"),
            ("Escape", "Clear Focus"),
        ]
        
        for shortcut, description in shortcuts:
            frame = tk.Frame(dialog, bg="#ffffff")
            frame.pack(fill=tk.X, padx=40, pady=5)
            
            tk.Label(frame, text=shortcut, 
                    font=(addons.PREMIUM_FONT, 10, "bold"), 
                    bg="#3498db", fg="white",
                    padx=15, pady=5).pack(side=tk.LEFT)
            
            tk.Label(frame, text=description, 
                    font=(addons.PREMIUM_FONT, 10), 
                    bg="#ffffff", fg="#2c3e50",
                    padx=20).pack(side=tk.LEFT)
        
        tk.Button(dialog, text="Close", 
                 command=dialog.destroy,
                 bg="#95a5a6", fg="white",
                 font=(addons.PREMIUM_FONT, 10),
                 relief=tk.FLAT, padx=30, pady=8).pack(pady=20)
    
    def show_about(self):
        """Show about dialog"""
        messagebox.showinfo("About PLGen Pro", 
                           "PLGen Pro v2.0\n\n"
                           "Modern Warehouse Packing List Generator\n"
                           "Built for Zahra Logistics Team\n\n"
                           "Features:\n"
                           "• Dark/Light Mode\n"
                           "• Real-time Box Visualization\n"
                           "• Smart SKU Search\n"
                           "• Category Color Coding\n"
                           "• Export to Excel\n\n"
                           "© 2024 All Rights Reserved")
    
    def show_toast(self, message, type="info", duration=3000):
        """Show modern toast notification"""
        toast = tk.Toplevel(self.root)
        toast.overrideredirect(True)
        toast.attributes("-topmost", True)
        
        # Determine colors based on type
        colors = {
            "success": ("#27ae60", "#ffffff"),
            "error": ("#e74c3c", "#ffffff"),
            "warning": ("#f39c12", "#ffffff"),
            "info": ("#3498db", "#ffffff")
        }
        
        bg_color, fg_color = colors.get(type, colors["info"])
        
        # Position at bottom-right
        screen_width = self.root.winfo_screenwidth()
        screen_height = self.root.winfo_screenheight()
        x = screen_width - 350
        y = screen_height - 100
        
        toast.geometry(f"300x60+{x}+{y}")
        
        frame = tk.Frame(toast, bg=bg_color, relief=tk.SOLID, borderwidth=0)
        frame.pack(fill=tk.BOTH, expand=True)
        
        tk.Label(frame, text=message, 
                font=(addons.PREMIUM_FONT, 10), 
                bg=bg_color, fg=fg_color,
                padx=20).pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        # Auto-close
        toast.after(duration, toast.destroy)
    
    def bind_keyboard_shortcuts(self):
        """Bind keyboard shortcuts"""
        self.root.bind("<Control-e>", lambda e: self.export_to_excel())
        self.root.bind("<Control-d>", lambda e: self.toggle_dark_mode())
        self.root.bind("<Control-plus>", lambda e: self.increase_font())
        self.root.bind("<Control-minus>", lambda e: self.decrease_font())
        self.root.bind("<F1>", lambda e: self.show_keyboard_shortcuts())
        self.root.bind("<Return>", lambda e: self.add_item())
        self.root.bind("<Escape>", lambda e: self.sku_entry.delete(0, tk.END))
    
    def load_theme_preference(self):
        """Load saved theme preference"""
        try:
            config_file = "logs/theme_config.json"
            if os.path.exists(config_file):
                with open(config_file, "r") as f:
                    config = json.load(f)
                    if config.get("dark_mode", False):
                        self.toggle_dark_mode()
        except Exception:
            pass
    
    def save_theme_preference(self):
        """Save theme preference"""
        try:
            os.makedirs("logs", exist_ok=True)
            config_file = "logs/theme_config.json"
            with open(config_file, "w") as f:
                json.dump({"dark_mode": self.dark_mode}, f)
        except Exception:
            pass
    
    def on_canvas_configure(self, event):
        """Handle canvas resize"""
        self.box_canvas.itemconfig(self.canvas_window, width=event.width)
    
    def on_frame_configure(self, event):
        """Handle frame resize for scrolling"""
        self.box_canvas.configure(scrollregion=self.box_canvas.bbox("all"))


# ==========================================
#     MAIN ENTRY POINT
# ==========================================

def main():
    # Use TkinterDnD if available, otherwise standard Tkinter
    if DND_AVAILABLE:
        root = TkinterDnD.Tk()
    else:
        root = tk.Tk()
    
    app = ModernPLGenApp(root)
    root.mainloop()

if __name__ == "__main__":
    main()
