# Point of Sale: how to use it

The Point of Sale is the billing counter inside Rooman Books. You scan products,
take cash, UPI or card, and print a receipt. Every sale is saved as a paid
invoice, so stock, GST and reports update by themselves.

Open it from the menu: **Point of Sale**.

---

## 1. Before you start (admin, one time)

### Give your products a barcode

1. Go to **Items** and open a product (or click **New item**).
2. Fill in the **Barcode** box, one of these ways:
   - type the number printed under the bars on the pack, or
   - click in the box and scan the pack with a barcode scanner, or
   - on a phone, tap **Scan with camera** under the box and point it at the barcode.
3. For goods you count, tick **Track inventory** and enter the **opening stock**.
4. Click **Save**.

Products without a barcode (loose rice, vegetables) can still be sold by typing
their **SKU** at the counter.

To add many products quickly with a phone, see section 5.

### Counter settings

Go to **Point of Sale → Counter settings**:

- **UPI and card takings go to**: the bank account for UPI and card money.
  Cash always goes to Petty Cash.
- **Allow selling when stock shows zero**: tick it if goods are on the shelf
  before their purchase is entered.
- **Receipt header** and **Receipt footer**: lines printed on every receipt
  (timings, return policy, and so on).

---

## 2. Making a sale

1. Open **Point of Sale**.
2. Add products to the bill, any of these ways:
   - **Barcode scanner** (USB or Bluetooth): just scan. It works wherever the cursor is.
   - **Laptop or phone camera**: tap **Scan with camera**, allow the camera, point it at the barcode.
   - **Type it**: enter the barcode or SKU in the box and press Enter.
   - **A second phone as the scanner**: see section 3.
3. Scanning the same product again adds one more. Use **−** / **+** or type a
   quantity to change it. Tap **−** at 1 to remove the line.
4. Enter a **Discount** if needed.
5. Tap **Pay**.

### Taking payment

- **Cash**: enter the cash received, or tap one of the amount buttons. The screen
  shows the **change to give**.
- **UPI** or **Card**: optionally type the UPI transaction ID or the last digits
  of the card.

Tap **Complete sale**. The receipt appears: tap **Print receipt** (80 mm
printers are supported), then **New sale**.

### If the internet drops while paying

The bill locks and shows **Retry payment**. Tap it when the connection is back.
The customer is **never charged twice**: if the first try already went through,
you get the same receipt.

If you are offline, a red bar says so. The open bill is kept on the device.

---

## 3. Using a phone as the scanner

The laptop does the billing; a phone in your hand does the scanning.

1. On the laptop, in **Point of Sale**, click **Use phone as scanner**.
   A QR code appears.
2. On the phone, open the camera, point it at the QR code and open the link.
   **No sign-in is needed**: a camera page opens straight away.
3. Allow the camera and scan a product. The phone shows its **name, price, GST
   and stock**. Set **How many**, then tap **Send to bill**.
4. The item appears on the laptop's bill within a second.
5. When you're done, click **Disconnect** on the laptop.

Good to know:

- **Fast scan** (the button at the top of the phone panel): every scan goes
  straight onto the bill, 1 each, without tapping Send.
- A barcode Books does not know asks for the **item name, price and GST**, then
  adds the item and sends it.
- The **Full screen** button (top right) gives the camera the whole screen; the
  screen stays on while scanning.
- A Bluetooth scanner paired with the phone works on this page too.
- The QR link **stops working by itself after 12 hours**, or straight away when
  you click Disconnect. Anyone holding the link can scan into your counter until
  then, so do not share the QR code.
- Open Books on the laptop by its web address (for example
  `https://books.futureacad.ae`), not `localhost`, or the phone cannot open the link.

---

## 4. Returns

1. Go to **Point of Sale → Sales & day end**.
2. Find the sale (pick the date) and tap **Open**.
3. Tap **Return items** and enter how many of each item came back.
4. Add a reason if you like, then tap **Refund and restock**.

The stock goes back in and the money is refunded the way it was paid (cash
from the drawer, UPI or card from the bank account). The receipt shows the return.

---

## 5. Adding items and stock with a phone

Use a phone to count goods onto the shelf or to add new products.

1. Go to **Items** and click **Add items with phone**. A QR code appears.
2. Scan it with the phone. A camera page opens, with no sign-in.
3. Scan a product:
   - **Known product**: enter **How many to add** and tap **Add to stock**.
   - **New barcode**: fill in **Item name, Price, GST, Unit, Cost price** and
     **How many on the shelf**, then tap **Create item**.
4. The item list on the laptop updates by itself as you scan.
5. Click **Disconnect** when done (or leave it: it ends after 12 hours).

**Fast scan** works here too: each scan adds 1 to stock.

---

## 6. End of the day

Go to **Point of Sale → Sales & day end**:

- **Net sales**, **Gross sales** (with the GST in it) and **Returns**.
- **Cash in drawer**: cash sales minus cash refunds. Count the drawer against it.
- Takings **by payment mode** (cash, UPI, card) and **by cashier**.
- **Top items** of the day.
- Every sale of the day, with its time and bill number.

Tap **Print day end** to print the report. Pick another date to see a past day.

The dashboard also shows a **Counter sales today** card.

---

## 7. Barcode scanners: what to buy and set up

Any USB or Bluetooth barcode scanner that works **as a keyboard** (often called
HID mode) works, with nothing to install. A **2D** scanner also reads QR codes
and barcodes on phone screens.

- **USB**: plug it in. On an Android phone, use a USB OTG adapter.
- **Bluetooth**: put the scanner in pairing mode and pair it in the phone's or
  computer's Bluetooth settings, like a keyboard.
- Set the scanner to send **Enter after each scan** (often called "CR suffix").
  Without it the number appears but the item is not added.

---

## 8. Problems and fixes

| What you see | What to do |
|---|---|
| "No item with the barcode or SKU …" | Give that product its barcode (section 1), or add it with the phone (section 5). |
| "Not enough stock" | Add the stock (Items → adjust stock, or section 5), or tick **Allow selling when stock shows zero** in Counter settings. |
| The camera doesn't open | The page must be on `https://`. Allow the camera: tap the lock next to the address → Permissions → Camera → Allow. |
| The phone cannot open the QR link | Open Books on the laptop by its web address, not `localhost`. |
| "Scanner link ended" on the phone | The link is older than 12 hours or was disconnected. Show a new QR code on the laptop. |
| A scanned number appears but the item isn't added | Turn on **Enter after each scan** on the scanner. |
| "Payment not confirmed" | Tap **Retry payment** when the internet is back. You won't be charged twice. |
| Viewer users can't sell | Selling needs a Staff or Admin login. Viewers can look at sales and the day end. |
