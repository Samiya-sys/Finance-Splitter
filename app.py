from flask import Flask, render_template, request, jsonify, redirect, url_for
import uuid
import heapq
from collections import defaultdict
import mysql.connector
from config import MYSQL_CONFIG

app = Flask(__name__)

# ------------------ MySQL Connection ------------------
mydb = mysql.connector.connect(**MYSQL_CONFIG)
cursor = mydb.cursor(dictionary=True)

# ------------------ ROUTES ------------------

@app.route('/')
def landing():
    return render_template('landing.html')


# ------------------ CREATE ROOM ------------------
@app.route('/create_room', methods=['POST'])
def create_room():
    # Accept form data (from landing.html FormData)
    creator_name = request.form.get('name', 'Anonymous').strip() or 'Anonymous'
    room_id = str(uuid.uuid4())[:8]  # 8-character unique ID

    # Insert room into DB
    cursor.execute(
        "INSERT INTO rooms (room_id, created_by) VALUES (%s, %s)",
        (room_id, creator_name)
    )
    mydb.commit()

    # Add creator as a user/member
    cursor.execute(
        "INSERT INTO users (name, room_id) VALUES (%s, %s)",
        (creator_name, room_id)
    )
    mydb.commit()

    return jsonify({"room_id": room_id})


# ------------------ JOIN ROOM ------------------
@app.route('/join/<room_id>', methods=['GET', 'POST'])
def join_room(room_id):
    # Check if room exists
    cursor.execute("SELECT * FROM rooms WHERE room_id = %s", (room_id,))
    room = cursor.fetchone()
    if not room:
        return "Room not found", 404

    # Determine the user's name: POST (form) or GET (query param ?name=)
    if request.method == 'POST':
        name = request.form.get('name', '').strip()
    else:
        name = request.args.get('name', '').strip()

    # If no name is provided, redirect back to landing page (keeps it simple)
    if not name:
        return redirect(url_for('landing'))

    # Add member if not already in DB
    cursor.execute("SELECT * FROM users WHERE room_id=%s AND name=%s", (room_id, name))
    if not cursor.fetchone():
        cursor.execute("INSERT INTO users (name, room_id) VALUES (%s, %s)", (name, room_id))
        mydb.commit()

    return render_template('room.html', room_id=room_id, name=name)


# ------------------ GET ROOM (members) ------------------
@app.route('/api/room/<room_id>', methods=['GET'])
def get_room(room_id):
    # Check if room exists
    cursor.execute("SELECT * FROM rooms WHERE room_id = %s", (room_id,))
    room = cursor.fetchone()
    if not room:
        return jsonify({"error": "Room not found"}), 404

    # Get all members
    cursor.execute("SELECT name FROM users WHERE room_id=%s", (room_id,))
    members = [row['name'] for row in cursor.fetchall()]

    return jsonify({"members": members})


# ------------------ ADD MEMBER ------------------
@app.route('/api/room/<room_id>/add_member', methods=['POST'])
def add_member(room_id):
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()

    if not name:
        return jsonify({"error": "Name required"}), 400

    # Check if room exists
    cursor.execute("SELECT * FROM rooms WHERE room_id = %s", (room_id,))
    room = cursor.fetchone()
    if not room:
        return jsonify({"error": "Room not found"}), 404

    # Add member if not already in DB
    cursor.execute("SELECT * FROM users WHERE room_id=%s AND name=%s", (room_id, name))
    if cursor.fetchone():
        # return updated members for UI convenience
        cursor.execute("SELECT name FROM users WHERE room_id=%s", (room_id,))
        members = [row['name'] for row in cursor.fetchall()]
        return jsonify({"message": "Member already exists", "members": members}), 200

    cursor.execute("INSERT INTO users (name, room_id) VALUES (%s, %s)", (name, room_id))
    mydb.commit()

    # return updated members
    cursor.execute("SELECT name FROM users WHERE room_id=%s", (room_id,))
    members = [row['name'] for row in cursor.fetchall()]
    return jsonify({"message": "Member added successfully", "members": members}), 200


# ------------------ ADD EXPENSE ------------------
@app.route('/api/room/<room_id>/add_expense', methods=['POST'])
def add_expense(room_id):
    # Accept JSON
    data = request.get_json() or {}
    payer = data.get('payer')
    try:
        amount = float(data.get('amount', 0))
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid amount"}), 400

    category = data.get('category', 'Misc') or 'Misc'
    shared_with = data.get('shared_with', [])
    note = data.get('note', '')
    split_type = data.get('split_type', 'equal')
    custom_splits = data.get('custom_splits', {})

    # Validate payer exists
    cursor.execute("SELECT * FROM users WHERE room_id=%s AND name=%s", (room_id, payer))
    if not cursor.fetchone():
        return jsonify({"error": "Payer not in room"}), 400

    # If no shared_with provided, split among all members
    if not shared_with:
        cursor.execute("SELECT name FROM users WHERE room_id=%s", (room_id,))
        shared_with = [row['name'] for row in cursor.fetchall()]

    if len(shared_with) == 0:
        return jsonify({"error": "No members to split with"}), 400

    # Calculate shares based on split type
    if split_type == 'custom' and custom_splits:
        # Custom percentage split
        for member in shared_with:
            if member in custom_splits:
                percentage = float(custom_splits[member])
                share = round((amount * percentage) / 100, 2)
                
                cursor.execute(
                    "INSERT INTO expenses (room_id, user_id, category, amount, description) "
                    "VALUES (%s, (SELECT user_id FROM users WHERE name=%s AND room_id=%s), %s, %s, %s)",
                    (room_id, member, room_id, category, share, note)
                )
    else:
        # Equal split
        share = round(amount / len(shared_with), 2)
        for member in shared_with:
            cursor.execute(
                "INSERT INTO expenses (room_id, user_id, category, amount, description) "
                "VALUES (%s, (SELECT user_id FROM users WHERE name=%s AND room_id=%s), %s, %s, %s)",
                (room_id, member, room_id, category, share, note)
            )
    
    mydb.commit()
    return jsonify({"ok": True}), 200


# ------------------ RECEIPT SCANNER ROUTE ------------------
@app.route('/receipt/<room_id>')
def receipt_scanner(room_id):
    # Check if room exists
    cursor.execute("SELECT * FROM rooms WHERE room_id = %s", (room_id,))
    room = cursor.fetchone()
    if not room:
        return "Room not found", 404

    # Get user name from query params
    name = request.args.get('name', '').strip()
    if not name:
        return redirect(url_for('landing'))

    return render_template('receipt.html', room_id=room_id, name=name)


# ------------------ GET EXPENSES HISTORY ------------------
@app.route('/api/room/<room_id>/expenses', methods=['GET'])
def get_expenses(room_id):
    # Check if room exists
    cursor.execute("SELECT * FROM rooms WHERE room_id = %s", (room_id,))
    room = cursor.fetchone()
    if not room:
        return jsonify({"error": "Room not found"}), 404

    # Get all expenses with user names
    cursor.execute(
        "SELECT e.expense_id, e.amount, e.category, e.description, e.created_at, u.name AS payer "
        "FROM expenses e "
        "JOIN users u ON e.user_id = u.user_id "
        "WHERE e.room_id = %s "
        "ORDER BY e.created_at DESC",
        (room_id,)
    )
    expenses = cursor.fetchall()

    return jsonify({"expenses": expenses})


# ------------------ ROOM SUMMARY ------------------
@app.route('/api/room/<room_id>/summary', methods=['GET'])
def room_summary(room_id):
    # Fetch all members
    cursor.execute("SELECT name FROM users WHERE room_id=%s", (room_id,))
    members = [row['name'] for row in cursor.fetchall()]

    # Fetch all expenses
    cursor.execute("SELECT u.name AS payer, e.amount, e.category FROM expenses e "
                   "JOIN users u ON e.user_id = u.user_id WHERE e.room_id=%s", (room_id,))
    expenses = cursor.fetchall()

    # Compute totals
    cat_totals = defaultdict(float)
    per_person_paid = defaultdict(float)
    per_person_owed = defaultdict(float)

    for e in expenses:
        # Convert Decimal to float
        amt = float(e['amount'])
        cat_totals[e['category']] += amt
        per_person_paid[e['payer']] += amt
        per_person_owed[e['payer']] += amt  # Each member owes their share

    # Net balance per member
    net = {}
    for m in members:
        net[m] = round(per_person_paid.get(m, 0) - per_person_owed.get(m, 0), 2)

    settlements = minimize_transactions(net)

    return jsonify({
        "members": members,
        "category_totals": dict(cat_totals),
        "paid": dict(per_person_paid),
        "owed": dict(per_person_owed),
        "net": net,
        "settlements": settlements
    })


# ------------------ MINIMIZE TRANSACTIONS (DSA Logic) ------------------
def minimize_transactions(net_balances):
    cents = {k: int(round(v * 100)) for k, v in net_balances.items()}

    creditors = []
    debtors = []
    for person, val in cents.items():
        if val > 0:
            heapq.heappush(creditors, (-val, person))
        elif val < 0:
            heapq.heappush(debtors, (-val, person))

    settlements = []
    while creditors and debtors:
        cred_val, cred_person = heapq.heappop(creditors)
        debt_val, debt_person = heapq.heappop(debtors)

        cred_val = -cred_val
        transfer = min(cred_val, debt_val)

        settlements.append({
            "from": debt_person,
            "to": cred_person,
            "amount": round(transfer / 100.0, 2)
        })

        cred_val -= transfer
        debt_val -= transfer

        if cred_val > 0:
            heapq.heappush(creditors, (-cred_val, cred_person))
        if debt_val > 0:
            heapq.heappush(debtors, (-debt_val, debt_person))

    return settlements


if __name__ == '__main__':
    app.run(debug=True)