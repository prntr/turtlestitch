// Tests for TurtleShepherd.prototype.toGCODE (stitchcode/turtleShepherd.js), the
// G-code exporter behind "Export as G-code (Klipper)".
//
// No dependencies: run with Node >= 18 from the repository root:
//
//     node --test test/
//
// The design is fed in through TurtleShepherd's own moveTo()/addColorChange(),
// the same calls the turtle makes, so the cache has its real shape (a start
// entry, colour entries in front of the move that uses them, repeated start
// entries while a design still begins with jumps). The output is checked
// against the StitchLabOS job-file contract: ';' comments only, G21/G90 first,
// one stitch = G1 X Y then G1 Z+5, no feed rates, no M84/M18/M30, ends with M400.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PX_PER_MM = 5;

function loadTurtleShepherd() {
    const context = vm.createContext({console});
    const file = path.join(__dirname, '..', 'stitchcode', 'turtleShepherd.js');
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, {filename: file});
    return context.TurtleShepherd;
}

const TurtleShepherd = loadTurtleShepherd();

// A minimal turtle in millimetres that records into a TurtleShepherd the way
// SpriteMorph.forward/gotoXY do.
function drawing(draw) {
    const shepherd = new TurtleShepherd();
    let x = 0;
    let y = 0;
    let down = true;
    const turtle = {
        penDown() { down = true; },
        penUp() { down = false; },
        color(r, g, b) { shepherd.addColorChange({r, g, b, a: 1}); },
        to(nx, ny) {
            shepherd.moveTo(x * PX_PER_MM, y * PX_PER_MM, nx * PX_PER_MM, ny * PX_PER_MM, down);
            x = nx;
            y = ny;
        },
    };
    draw(turtle, shepherd);
    return shepherd;
}

// Lines of the file without the header comments and the footer.
function bodyOf(gcode) {
    const lines = gcode.split('\n');
    const first = lines.indexOf('G90 ; absolute positioning') + 1;
    const last = lines.indexOf('M400 ; wait for moves to finish');
    return lines.slice(first, last);
}

const COMMAND = [
    /^G21 ; millimeters$/,
    /^G90 ; absolute positioning$/,
    /^G0 X\d+\.\d{3} Y\d+\.\d{3}$/,
    /^G1 X\d+\.\d{3} Y\d+\.\d{3}$/,
    /^G1 Z\d+\.\d{3}$/,
    /^M400 ; wait for moves to finish$/,
    /^COLOR_CHANGE$/,
];

// Checks every rule of the job-file contract and the stitch model. Returns the
// number of penetrations (Z steps) for further checks.
function assertJobFile(gcode, startZ = 0) {
    assert.ok(gcode.endsWith('\n'), 'ends with a newline (Klipper skips a last line without one)');
    const lines = gcode.slice(0, -1).split('\n');
    const commands = lines.filter((line) => !line.startsWith(';'));

    for (const line of lines) {
        assert.ok(!line.includes('('), `no parenthesised comments: ${line}`);
        if (!line.startsWith(';')) {
            assert.ok(COMMAND.some((re) => re.test(line)), `allowed command: ${line}`);
        }
    }
    assert.deepEqual(commands.slice(0, 2), ['G21 ; millimeters', 'G90 ; absolute positioning']);
    assert.equal(commands[commands.length - 1], 'M400 ; wait for moves to finish');
    assert.ok(!/M84|M18|M30|M2\b|G28|G20| F\d/.test(gcode), 'no M84/M18/M30/M2/G28/G20 and no feed rates');

    let z = startZ;
    let position = null;
    let penetratedAt = null; // position of the last penetration of the loaded thread
    let penetrations = 0;
    lines.forEach((line, index) => {
        let m = line.match(/^G[01] (X\d+\.\d{3} Y\d+\.\d{3})$/);
        if (m) {
            if (line.startsWith('G1')) {
                assert.equal(penetratedAt, position, `stitch starts at a penetrated point: ${line}`);
            }
            position = m[1];
            return;
        }
        m = line.match(/^G1 Z(\d+\.\d{3})$/);
        if (m) {
            z += 5;
            assert.equal(Number(m[1]), z, `Z grows by 5 per penetration: ${line}`);
            assert.notEqual(position, null, 'penetration after a start position');
            penetratedAt = position;
            penetrations++;
            return;
        }
        if (line === 'COLOR_CHANGE') {
            assert.equal(z % 5, 0, 'needle up at COLOR_CHANGE');
            assert.match(lines[index - 1], /^; color r:\d+ g:\d+ b:\d+$/, 'colour comment right before COLOR_CHANGE');
            penetratedAt = null; // new thread, not yet anchored
        }
    });
    assert.match(gcode, new RegExp(`^; Stitches: ${penetrations}$`, 'm'), 'header counts the penetrations');
    assert.match(gcode, new RegExp(`^; Total Z travel: ${(z - startZ).toFixed(1)}mm$`, 'm'));
    return penetrations;
}

// ---------------------------------------------------------------------------

test('single colour with a jump: start and jump end get one penetration', () => {
    const shepherd = drawing((t) => {
        t.to(10, 0);
        t.to(10, 10);
        t.penUp();
        t.to(20, 20);
        t.penDown();
        t.to(30, 20);
        t.penUp();
        t.to(40, 40); // trailing jump: nothing follows, no penetration
    });
    const gcode = shepherd.toGCODE();

    assert.deepEqual(bodyOf(gcode), [
        'G0 X0.000 Y0.000',
        'G1 Z5.000', // start point
        'G1 X10.000 Y0.000',
        'G1 Z10.000',
        'G1 X10.000 Y10.000',
        'G1 Z15.000',
        'G0 X20.000 Y20.000',
        'G1 Z20.000', // end of the jump
        'G1 X30.000 Y20.000',
        'G1 Z25.000',
        'G0 X40.000 Y40.000',
    ]);
    assert.equal(assertJobFile(gcode), 5);
    assert.ok(!gcode.includes('COLOR_CHANGE') && !/; color/.test(gcode), 'single colour: no colour output');
});

test('footer: M400, no M84, trailing newline', () => {
    const gcode = drawing((t) => { t.to(5, 5); }).toGCODE();
    assert.ok(!gcode.includes('M84'));
    assert.ok(gcode.endsWith('M400 ; wait for moves to finish\n; Total Z travel: 10.0mm\n'));
    assertJobFile(gcode);
});

test('colour changes: comment, COLOR_CHANGE, then an anchoring penetration', () => {
    const shepherd = drawing((t) => {
        t.color(255, 0, 0); // first thread, set before the first move
        t.to(10, 0);
        t.to(10, 10);
        t.color(0, 0, 255); // change while stitching on: no jump
        t.to(20, 10);
        t.penUp();
        t.color(0, 255, 0); // change together with a jump
        t.to(30, 30);
        t.penDown();
        t.to(40, 30);
    });
    const gcode = shepherd.toGCODE();

    assert.deepEqual(bodyOf(gcode), [
        '; color r:255 g:0 b:0', // first thread: comment only, for the preview
        'G0 X0.000 Y0.000',
        'G1 Z5.000',
        'G1 X10.000 Y0.000',
        'G1 Z10.000',
        'G1 X10.000 Y10.000',
        'G1 Z15.000',
        '; color r:0 g:0 b:255',
        'COLOR_CHANGE',
        'G1 Z20.000', // the blue thread is anchored where red stopped
        'G1 X20.000 Y10.000',
        'G1 Z25.000',
        '; color r:0 g:255 b:0',
        'COLOR_CHANGE', // before the jump: the thread is cut where the stitches end
        'G0 X30.000 Y30.000',
        'G1 Z30.000',
        'G1 X40.000 Y30.000',
        'G1 Z35.000',
    ]);
    assert.match(gcode, /^; Color changes: 2$/m);
    assert.equal(assertJobFile(gcode), 7);
    assert.equal(gcode.split('\n').filter((l) => l === 'COLOR_CHANGE').length, 2);
});

test('first thread is not a change; default colour without any change writes no colour', () => {
    const onlyFirst = drawing((t) => {
        t.color(255, 0, 0);
        t.to(10, 0);
    }).toGCODE();
    assert.ok(!onlyFirst.includes('COLOR_CHANGE'));
    assert.ok(!/; color/.test(onlyFirst), 'no colour change in the file: no colour comments');
    assertJobFile(onlyFirst);

    const defaultFirst = drawing((t) => {
        t.to(10, 0);
        t.color(0, 0, 255);
        t.to(20, 0);
    }).toGCODE();
    assert.deepEqual(bodyOf(defaultFirst).slice(0, 2), ['; color r:0 g:0 b:0', 'G0 X0.000 Y0.000']);
    assert.equal(defaultFirst.split('\n').filter((l) => l === 'COLOR_CHANGE').length, 1);
    assertJobFile(defaultFirst);
});

test('a colour that is never sewn causes no pause', () => {
    const gcode = drawing((t) => {
        t.color(255, 0, 0);
        t.to(10, 0);
        t.penUp();
        t.color(0, 0, 255); // only jumps in blue ...
        t.to(20, 0);
        t.color(255, 0, 0); // ... and back to the loaded thread
        t.to(30, 0);
        t.penDown();
        t.to(40, 0);
    }).toGCODE();
    assert.ok(!gcode.includes('COLOR_CHANGE'));
    assertJobFile(gcode);

    const folded = drawing((t) => {
        t.color(255, 0, 0);
        t.to(10, 0);
        t.penUp();
        t.color(0, 0, 255); // replaced before any stitch
        t.to(20, 0);
        t.color(0, 255, 0);
        t.to(30, 0);
        t.penDown();
        t.to(40, 0);
    }).toGCODE();
    const colors = folded.split('\n').filter((l) => /^; color/.test(l));
    assert.deepEqual(colors, ['; color r:255 g:0 b:0', '; color r:0 g:255 b:0']);
    assert.equal(folded.split('\n').filter((l) => l === 'COLOR_CHANGE').length, 1);
    assertJobFile(folded);
});

test('a colour set at the very end is not a change', () => {
    const gcode = drawing((t) => {
        t.to(10, 0);
        t.penUp();
        t.color(0, 0, 255);
        t.to(20, 0);
    }).toGCODE();
    assert.ok(!gcode.includes('COLOR_CHANGE'));
    assertJobFile(gcode);
});

test('ignore colors writes a one-thread file', () => {
    const gcode = drawing((t, shepherd) => {
        shepherd.ignoreColors = true;
        t.color(255, 0, 0);
        t.to(10, 0);
        t.color(0, 0, 255);
        t.to(20, 0);
    }).toGCODE();
    assert.ok(!gcode.includes('COLOR_CHANGE') && !/; color/.test(gcode));
    assert.deepEqual(bodyOf(gcode), [
        'G0 X0.000 Y0.000',
        'G1 Z5.000',
        'G1 X10.000 Y0.000',
        'G1 Z10.000',
        'G1 X20.000 Y0.000',
        'G1 Z15.000',
    ]);
    assertJobFile(gcode);
});

test('several jumps in a row get one penetration, after the last one', () => {
    const gcode = drawing((t) => {
        t.to(10, 0);
        t.penUp();
        t.to(15, 5);
        t.to(25, 5);
        t.to(25, 15);
        t.penDown();
        t.to(35, 15);
    }).toGCODE();
    assert.deepEqual(bodyOf(gcode).slice(4), [
        'G0 X15.000 Y5.000',
        'G0 X25.000 Y5.000',
        'G0 X25.000 Y15.000',
        'G1 Z15.000',
        'G1 X35.000 Y15.000',
        'G1 Z20.000',
    ]);
    assertJobFile(gcode);
});

test('trim (tiny jumps that return to the last stitch) adds no penetration', () => {
    const gcode = drawing((t) => {
        t.to(10, 0);
        t.penUp(); // what SpriteMorph.trimStitch does: forward 2, back 4, forward 2
        t.to(10.4, 0);
        t.to(9.6, 0);
        t.to(10, 0);
        t.penDown();
        t.to(20, 0);
    }).toGCODE();
    const zLines = gcode.split('\n').filter((l) => l.startsWith('G1 Z'));
    assert.deepEqual(zLines, ['G1 Z5.000', 'G1 Z10.000', 'G1 Z15.000']);
    assertJobFile(gcode);
});

test('a design that starts with jumps: no negative coordinates, no repeated moves', () => {
    const shepherd = drawing((t) => {
        t.penUp();
        t.to(-20, -20);
        t.to(0, 0);
        t.to(10, 10);
        t.penDown();
        t.to(20, 10);
    });
    // moveTo resets its running bounding box in this phase (min ends at 10,10)
    assert.equal(shepherd.minX / PX_PER_MM, 10);
    const gcode = shepherd.toGCODE();

    assert.deepEqual(bodyOf(gcode), [
        'G0 X20.000 Y20.000',
        'G0 X0.000 Y0.000',
        'G0 X20.000 Y20.000',
        'G0 X30.000 Y30.000',
        'G1 Z5.000', // one penetration at the end of the jumps, not two
        'G1 X40.000 Y30.000',
        'G1 Z10.000',
    ]);
    assert.match(gcode, /^; Size: 40\.0mm x 30\.0mm$/m);
    assertJobFile(gcode);
});

test('startZMm and zPerStitchMm options still apply', () => {
    const gcode = drawing((t) => { t.to(10, 0); }).toGCODE({startZMm: 10, zPerStitchMm: 5});
    assert.deepEqual(bodyOf(gcode), ['G0 X0.000 Y0.000', 'G1 Z15.000', 'G1 X10.000 Y0.000', 'G1 Z20.000']);
    assertJobFile(gcode, 10);
});

test('an empty drawing exports nothing', () => {
    assert.equal(new TurtleShepherd().toGCODE(), null);
});
