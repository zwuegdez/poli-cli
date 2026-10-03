const rows = process.stdout.rows;
// Set scrolling region to rows 1 to rows-1
process.stdout.write(`\x1b[1;${rows-1}r`);
// Move to bottom row, print status bar
process.stdout.write(`\x1b[${rows};1H\x1b[44m\x1b[37m STATUS BAR - FIXED \x1b[0m\x1b[K`);
// Move to top and print a bunch of lines
process.stdout.write(`\x1b[1;1H`);
for (let i = 0; i < 100; i++) {
  console.log('Line ' + i);
}
// Reset scrolling region
process.stdout.write(`\x1b[1;${rows}r`);
