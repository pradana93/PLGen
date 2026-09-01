# PLGen Pro - Warehouse Packing List Generator

## 📦 Modern Logistics Solution for Zahra Team

A production-grade, enterprise-level warehouse packing list generator with a beautiful modern UI, intelligent packing algorithms, and cloud synchronization capabilities.

![Version](https://img.shields.io/badge/version-2.0-blue)
![Python](https://img.shields.io/badge/python-3.8+-green)
![License](https://img.shields.io/badge/license-proprietary-red)

---

## ✨ Features

### 🎨 **Modern UI/UX**
- **Dark/Light Mode Toggle** - Switch themes based on preference or lighting conditions
- **Color-Coded Categories** - Visual distinction for Frozen, Sauce, Packaging, and more
- **Live Box Capacity Progress Bars** - Real-time fill percentage visualization
- **Dashboard Analytics** - Today's orders count and total boxes packed
- **Toast Notifications** - Modern feedback system for user actions
- **Smooth Animations** - Polished user experience

### 🚀 **Smart Workflow**
- **Fuzzy SKU Search** - Auto-complete with typo tolerance
- **Quick Filter Chips** - One-click category filtering
- **Keyboard Shortcuts** - Full keyboard navigation support
- **Outlet Validation** - Smart typo detection with suggestions
- **Audio Feedback** - Success/error beeps for hands-free operation
- **Drag & Drop Support** - Import orders via file drag (when tkinterdnd2 installed)

### 📊 **Advanced Packing Algorithm**
- **Category-Aware Logic** - Intelligent grouping by product type
- **Space Optimization** - Maximizes box utilization (tolerance: 1.859)
- **Special Item Handling** - Custom rules for Keju, Bundle items, Big items
- **Multi-Box Calculation** - Automatically splits large orders

### ☁️ **Cloud-First Architecture**
- **Auto-Sync Master Data** - Fetches from PythonAnywhere server
- **Local Cache Fallback** - Works offline with cached data
- **Doomsday Backup** - Hardcoded fallback if all else fails
- **Dynamic Checker Updates** - Server-managed checker list

### 🔒 **Security Features**
- **Encrypted Vaults** - cryptography.fernet for sensitive data
- **HWID-Based Licensing** - Device-specific authentication
- **Anti-Cheat Mechanisms** - Prevents unauthorized modifications

---

## 🖥️ Screenshots

### Light Mode Dashboard
```
┌─────────────────────────────────────────────────────────────┐
│  📦 PLGen Pro                          📋 Today's  📦 Total │
│  Data: Cloud Sync ☁️                      Orders      Boxes  │
│                                              0          0    │
├─────────────────┬───────────────────────────────────────────┤
│ 📝 Order Details│ 📦 Packing List Preview                   │
│                 │                                           │
│ Outlet Name     │ ┌─────────────────────────────────────┐   │
│ [____________]  │ │ 📦 Box #1                           │   │
│                 │ │ ─────────────────────────────────── │   │
│ Delivery Date   │ │ ❄️ Beef Patty Small        × 18    │   │
│ [15 January 2024]│ │ 🍟 Kentang Goreng          × 15    │   │
│                 │ │                                     │   │
│ Add Items       │ │ ████████████████████░░ 85%         │   │
│ [SKU____] [Qty] │ └─────────────────────────────────────┘   │
│   ➕ Add        │                                           │
│                 │ ┌─────────────────────────────────────┐   │
│ Quick Filters:  │ │ 📦 Box #2                           │   │
│ ❄️ 🍟 🥫 📦     │ │ ...                                 │   │
│                 │ └─────────────────────────────────────┘   │
│ Order Items     │                                           │
│ ┌─────────────┐ │ 📊 Export Excel  🖨️ Print                │
│ │ SKU | Qty   │ │                                           │
│ ├─────────────┤ │                                           │
│ │ ...         │ │                                           │
│ └─────────────┘ │                                           │
│                 │                                           │
│ 🗑️ Clear  ✨ Generate                                   │
└─────────────────┴───────────────────────────────────────────┘
│ Ready | Checkers: Aji, Luthfi, Fadly    ☀️ Light Mode      │
└─────────────────────────────────────────────────────────────┘
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + E` | Export to Excel |
| `Ctrl + D` | Toggle Dark Mode |
| `Ctrl + +` | Increase Font Size |
| `Ctrl + -` | Decrease Font Size |
| `F1` | Show Keyboard Shortcuts |
| `Enter` | Add Item |
| `Escape` | Clear Focus |

---

## 📦 Installation

### Prerequisites
- Python 3.8 or higher
- pip package manager

### Step 1: Clone Repository
```bash
git clone <your-repo-url>
cd <repository-folder>
```

### Step 2: Install Dependencies
```bash
pip install -r requirements.txt
```

**Required packages:**
```
tkinter
openpyxl
requests
cryptography
tkinterdnd2  # Optional: for drag & drop support
```

### Step 3: Run Application
```bash
python core.py
```

---

## 🏗️ Project Structure

```
PLGen/
├── core.py              # Main application with modern UI
├── addons.py            # Helper functions and utilities
├── flask_app.py         # Flask server for PythonAnywhere
├── admin_overhaul.py    # Streamlit admin panel
├── Devmode.py           # Development/testing tools
├── README.md            # This documentation
├── requirements.txt     # Python dependencies
└── logs/                # Auto-generated folder
    ├── master_data_cache.json
    ├── delivery_counter_BBB.txt
    └── theme_config.json
```

---

## 🎯 Usage Guide

### Creating a Packing List

1. **Enter Outlet Name**
   - Type the outlet name in the input field
   - System will auto-suggest similar outlets if typo detected
   - New outlets can be registered automatically

2. **Set Delivery Date**
   - Default is today's date
   - Can be customized for future orders

3. **Add Items**
   - Type SKU name (supports partial match)
   - Enter quantity
   - Click "➕ Add" or press Enter
   - Use filter chips for quick category access

4. **Generate Packing List**
   - Click "✨ Generate Packing List"
   - View real-time box visualization
   - See capacity percentages for each box

5. **Export/Print**
   - Click "📊 Export Excel" for spreadsheet
   - Click "🖨️ Print" for physical labels

---

## 🌐 Server Deployment (PythonAnywhere)

### Flask Server Setup

1. **Upload `flask_app.py`** to PythonAnywhere
2. **Configure WSGI** settings in dashboard
3. **Set up static files** for master_data.json
4. **Enable HTTPS** for secure connections

### API Endpoints

```
GET /api/checkers          - Returns list of authorized checkers
GET /static/master_data.json - Master data for client sync
POST /api/register_outlet  - Register new outlet (admin only)
GET /api/stats             - Performance analytics
```

---

## 🎨 Color Coding System

| Category | Color | Hex Code |
|----------|-------|----------|
| ❄️ Frozen | Blue | `#3498db` |
| 🍟 Potato | Yellow | `#f1c40f` |
| 🥫 Sauce | Red | `#e74c3c` |
| 📦 Packaging | Green | `#2ecc71` |
| 👕 Apparel | Purple | `#9b59b6` |
| 🧼 Big Items | Orange | `#e67e22` |
| 🍞 Bread | Brown | `#d35400` |
| 🎁 Bundle | Teal | `#1abc9c` |

---

## 🔧 Configuration

### Environment Variables (Recommended)
```bash
export MASTER_DATA_URL="https://your-server.com/static/master_data.json"
export FLASK_SECRET_KEY="your-secret-key"
export DATABASE_URL="sqlite:///plgen.db"
```

### Master Data Format (JSON)
```json
{
  "BOX_TOLERANCE": 1.859,
  "CATEGORIES": {
    "FROZEN_ITEMS": ["Beef Patty Small", "..."],
    "KENTANG_ITEMS": ["Kentang Goreng", "..."]
  },
  "ITEM_UOM": {
    "Beef Patty Small": "Pack",
    "...": "..."
  },
  "BOX_CAPACITY": {
    "Beef Patty Small": 18,
    "...": "..."
  },
  "OUTLET_INFO": {
    "OUTLET_NAME": {
      "address": "...",
      "code": "..."
    }
  }
}
```

---

## 🐛 Troubleshooting

### Issue: Application won't start
**Solution:** Ensure all dependencies are installed:
```bash
pip install --upgrade -r requirements.txt
```

### Issue: Dark mode not saving
**Solution:** Check write permissions for `logs/` folder:
```bash
chmod 755 logs/
```

### Issue: Cloud sync failing
**Solution:** Verify internet connection and server URL accessibility

### Issue: Drag & drop not working
**Solution:** Install tkinterdnd2:
```bash
pip install tkinterdnd2
```

---

## 📊 Performance Metrics

- **Average Packing Time:** < 2 seconds for 100+ items
- **Box Optimization:** 85-95% capacity utilization
- **Offline Capability:** 100% functional without internet
- **Data Sync:** < 4 seconds cloud fetch timeout

---

## 🛡️ Security Best Practices

1. **Never commit** `.env` files with credentials
2. **Rotate API keys** regularly
3. **Enable HTTPS** for all server communications
4. **Backup** master_data_cache.json regularly
5. **Restrict admin panel** access with strong passwords

---

## 📝 Changelog

### Version 2.0 (Current)
- ✨ Complete UI/UX overhaul with modern design
- 🌙 Dark/Light mode toggle
- 📊 Real-time dashboard analytics
- 🎨 Category color coding
- ⌨️ Full keyboard shortcut support
- 🔔 Modern toast notification system
- 📦 Live box capacity visualization
- 🔍 Enhanced fuzzy search

### Version 1.0 (Previous)
- Initial release with basic packing algorithm
- Cloud sync functionality
- Outlet validation system
- Excel export feature

---

## 👥 Credits

**Developed for:** Zahra Logistics Team  
**Lead Developer:** [Your Name]  
**Version:** 2.0  
**Last Updated:** January 2024

---

## 📞 Support

For issues, feature requests, or questions:
- Create an issue on GitHub
- Contact the development team
- Check the troubleshooting section

---

## 📄 License

Proprietary software - All rights reserved  
Unauthorized copying, distribution, or modification is strictly prohibited.

---

**Made with ❤️ for efficient logistics operations**