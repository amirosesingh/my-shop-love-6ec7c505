# Go-live checklist

Work through this on the real shop hardware, in order. Anything that fails
stops the go-live — none of these are optional.

## Before the day

- [ ] Every branch exists in the system with the right name, code and address.
- [ ] Every member of staff has their own account and the role they should
      have. No shared logins.
- [ ] The owner's account is the only one that can change roles.
- [ ] Products loaded, with barcodes, prices, tax rates and opening stock
      counted on the shelf, not carried over from a spreadsheet.
- [ ] Suppliers and stringing services loaded.
- [ ] Receipt header, footer, logo and tax wording checked on a printed copy.
- [ ] Bill numbering starts where the old system stopped.
- [ ] A backup has been taken and a restore of that backup tested on a spare
      machine.

## Each till

- [ ] Activated with its own code; the code is refused on a second machine.
- [ ] The branch shown on screen is the branch the till is standing in.
- [ ] Receipt prints, and prints again on a reprint.
- [ ] Cash drawer opens on a cash sale and on a no-sale.
- [ ] Barcode scanner reads a product.
- [ ] Customer display shows the basket and clears after the sale.
- [ ] Automatic updates point at the live release channel.
- [ ] Emergency access code works on that device's own clock.

## Rehearsal, with the network unplugged

- [ ] Open a shift, sell, take cash and card, print — the till keeps working.
- [ ] The screen says clearly that the till is offline.
- [ ] Plug the network back in: everything sent, queue empty, no duplicates
      on the central copy.
- [ ] Close the shift offline: the count is held and sent on reconnect.
- [ ] Pull the plug mid-sale and check the sale is either complete or absent
      — never half.

## Rehearsal, with the network up

- [ ] Sell the same product on two tills at once; both counts agree
      afterwards. Stock is allowed to go negative — check the reorder report
      shows it.
- [ ] Refund a bill and confirm the stock comes back exactly once.
- [ ] A manager override is asked for where it should be, and refused with
      the wrong PIN.
- [ ] Revoke a till's activation from the admin screen; that till stops
      selling within the heartbeat window.
- [ ] X report mid-shift and Z report at close both agree with the drawer.

## Day one

- [ ] Someone with admin access is on site or reachable all day.
- [ ] The old system stays available, read-only, for one week.
- [ ] The Sync screen is checked at close: queue empty, no quarantined items.
- [ ] A backup is taken at the end of the first trading day.

## Sign-off

| Item | Checked by | Date |
|---|---|---|
| Data loaded and verified | | |
| Tills activated and printing | | |
| Offline rehearsal passed | | |
| Online rehearsal passed | | |
| Owner accepts go-live | | |

## Stage 4 sign-off

- [ ] On a real till, confirm the database tools ask for an administrator sign-in and refuse a cashier.
- [ ] Confirm a link in a receipt or note opens in the browser, not inside the till window.
- [ ] Install this build over an older till and confirm unsent sales and shifts are still there afterwards.
- [ ] Switch a till off during the first launch of this build and confirm it comes up complete on the next start.
- [ ] Confirm a non-supervisor on the recovery screen sees only the connection cards.
