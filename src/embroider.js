/*

    embroider.js

    machine-stitch turtle pen trails with SNAP!

    written by Michael Aschauer and Jens Mönig
    m@ash.to, jens@moenig.org

    Copyright (C) 2024 by Michael Aschauer and Jens Mönig

    This file is part of Snap!.

    Snap! is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as
    published by the Free Software Foundation, either version 3 of
    the License, or (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.


    prerequisites:
    --------------
    needs morphic.js and gui.js

*/

/*global modules, Color, saveAs*/

/*jshint esversion: 6, bitwise: false*/

modules.embroider = '2024-May-09';

/*

cache =
 [
     {  "cmd":"move", "x":x1, "y":y1, "penDown":penState }
     {  "cmd":"color", "color": color, "thread": colorIndex }
 ]
colors = 
 [
     {r:0,g:0,b:0,a:1};
 ]

  blob = new Blob([expUintArr], {type: 'application/octet-stream'});
  saveAs(blob, name + '.dst');

 */


function buildEmbroideryCache(trailsLog) {
    var cache = [],
        bottomLeft,
        topRight,
        p1, p2, lastPoint,
        steps = 0,
        color,
        lastColor = new Color(),
        clr = {r: lastColor.r, g: lastColor.g, b: lastColor.b, a: lastColor.a},
        colors = [clr];

    if (!trailsLog || trailsLog.length === 0) {
        return {
            cache: [],
            bottomLeft: new Point(0, 0),
            topRight: new Point(0, 0),
            steps: 0,
            colors: colors
        };
    }

    bottomLeft = trailsLog[0][0];
        topRight = bottomLeft,
        p1, p2, lastPoint,
        steps = 0,
        color,
        lastColor = new Color(),
        clr = {r: lastColor.r, g: lastColor.g, b: lastColor.b, a: lastColor.a},
        colors = [clr];

    trailsLog.forEach(line => {
        bottomLeft = bottomLeft.min(line[0]);
        bottomLeft = bottomLeft.min(line[1]);
        topRight = topRight.max(line[0]);
        topRight = topRight.max(line[1]);
    });

    lastPoint = trailsLog[0][1];
    trailsLog.forEach(line => {
        p1 = line[0];
        p2 = line[1];
        if (!p1.eq(lastPoint)) {
            cache.push({
                cmd: "move",
                x: p1.x,
                y: p1.y,
                penDown: false
            });
            steps += 1;
            lastPoint = p1;
        }
        if (!p2.eq(lastPoint)) {
            color = line[2];
            if (!color.eq(lastColor)) { // color change
                clr = {r: color.r, g: color.g, b: color.b, a: color.a};
                cache.push({
                    cmd: "color",
                    color: clr,
                    thread: 1
                });
                lastColor = color;
            }
            cache.push({
                cmd: "move",
                x: p2.x,
                y: p2.y,
                penDown: true
            });
            steps += 1;
            lastPoint = p2;
        }
    });

    return {
        cache: cache,
        bottomLeft: bottomLeft,
        topRight: topRight,
        steps: steps,
        colors: colors,
        box: bottomLeft.corner(topRight),
        firstPoint: trailsLog[0][0]
    };
}

function exportEmbroidery(trailsLog, name = 'unnamed', type = 'dst') {
    var cacheData = buildEmbroideryCache(trailsLog),
        cache = cacheData.cache,
        bottomLeft = cacheData.bottomLeft,
        topRight = cacheData.topRight,
        box = cacheData.box,
        steps = cacheData.steps,
        colors = cacheData.colors,
        dta, blob;

    if (type === 'dst') {
        dta = toDST(
            name,
            cache,
            0, // init x
            0, // init y
            0, // last x
            0, // last y
            box.left(), // min x
            box.top(), // min y
            box.right(), // max x
            box.bottom(), // max y
            steps,
            colors
        );
    } else {
        type = 'exp';
        dta = toEXP(cache);
    }

    blob = new Blob([dta], {type: 'application/octet-stream'});
    saveAs(blob, name + '.' + type);
}

function toDST(
    name = "noname",
    cache = [], // array of command (see above)
    initX = 0, // initial x postion (normally 0 )
    initY = 0, // initial y postion (normally 0 )
    lastX = 0, // last position x
    lastY = 0, // last position y
    minX = 0, // minmal x position (boudning box)
    maxX = 0, // maximum x position (boudning box)
    minY = 0, // minmal y position (boudning box)
    maxY = 0, // maximum y position (boudning box)
    steps = 0, // total number of steps
    colors = [], // array of colors
    ignoreColors = true, // if true, ignore colors
    pixels_per_millimeter = 5
) {
    /* 
    exports cache to DST embroidery format
    returns UintArray suitable for Blob 
    */

    var expArr = [],
        lastStitch = null,
        hasFirst = false,
        // pixels_per_millimeter = 5; //this.pixels_per_millimeter;
        scale = 10 / pixels_per_millimeter,
        count_stitches = 0;
        // count_jumps = 0;

    function encodeTajimaStitch(dx, dy, jump) {
        var b1 = 0;
        var b2 = 0;
        var b3 = 0;

        if (dx > 40) {
            b3 |= 0x04;
            dx -= 81;
        }

        if (dx < -40) {
            b3 |= 0x08;
            dx += 81;
        }

        if (dy > 40) {
            b3 |= 0x20;
            dy -= 81;
        }

        if (dy < -40) {
            b3 |= 0x10;
            dy += 81;
        }

        if (dx > 13) {
            b2 |= 0x04;
            dx -= 27;
        }

        if (dx < -13) {
            b2 |= 0x08;
            dx += 27;
        }

        if (dy > 13) {
            b2 |= 0x20;
            dy -= 27;
        }

        if (dy < -13) {
            b2 |= 0x10;
            dy += 27;
        }

        if (dx > 4) {
            b1 |= 0x04;
            dx -= 9;
        }

        if (dx < -4) {
            b1 |= 0x08;
            dx += 9;
        }

        if (dy > 4) {
            b1 |= 0x20;
            dy -= 9;
        }

        if (dy < -4) {
            b1 |= 0x10;
            dy += 9;
        }

        if (dx > 1) {
            b2 |= 0x01;
            dx -= 3;
        }

        if (dx < -1) {
            b2 |= 0x02;
            dx += 3;
        }

        if (dy > 1) {
            b2 |= 0x80;
            dy -= 3;
        }

        if (dy < -1) {
            b2 |= 0x40;
            dy += 3;
        }

        if (dx > 0) {
            b1 |= 0x01;
            dx -= 1;
        }

        if (dx < 0) {
            b1 |= 0x02;
            dx += 1;
        }

        if (dy > 0) {
            b1 |= 0x80;
            dy -= 1;
        }

        if (dy < 0) {
            b1 |= 0x40;
            dy += 1;
        }

        expArr.push(b1);
        expArr.push(b2);
        if (jump) {
            expArr.push(b3 | 0x83);
        } else {
            expArr.push(b3 | 0x03);
        }
    }

    function writeHeader(str, length, padWithSpace = true) {
        for (var i = 0; i < length - 1; i++) {
            if (i < str.length) {
                expArr.push("0xF1" + str[i].charCodeAt(0).toString(16));
            } else {
                if (padWithSpace) {
                    expArr.push(0x20);
                } else {
                    expArr.push(0x00);
                }
            }
        }
        expArr.push(0x0d);
    }

    function pad(n, width, z) {
        z = z || ' ';
        n = n != 0 ? n + '' : "0";
        return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
    }

    var extx1 = Math.round(maxX) - initX;
    var exty1 = Math.round(maxY) - initY;
    var extx2 = Math.round(minX) - initX;
    var exty2 = Math.round(minY) - initY;

    writeHeader("LA:" + name.substr(0, 16), 20, true);
    writeHeader("ST:" + pad(steps, 7), 11);
    writeHeader("CO:" + pad(colors.length, 3), 7);
    writeHeader("+X:" + pad(Math.round(extx1 / pixels_per_millimeter) * 10, 5), 9); // Math.round(this.getMetricWidth()*10), 9);
    writeHeader("-X:" + pad(Math.abs(Math.round(extx2 / pixels_per_millimeter)) * 10, 5), 9);
    writeHeader("+Y:" + pad(Math.round(exty1 / pixels_per_millimeter) * 10, 5), 9); //Math.round(this.getMetricHeight()*10), 9);
    writeHeader("-Y:" + pad(Math.abs(Math.round(exty2 / pixels_per_millimeter)) * 10, 5), 9);

    var needle_end_x = lastX - initX;
    var needle_end_y = lastY - initY;

    writeHeader("AX:" + pad(Math.round(needle_end_x / pixels_per_millimeter) * 10, 6), 10);
    writeHeader("AY:" + pad(Math.round(needle_end_y / pixels_per_millimeter) * 10, 6), 10);
    writeHeader("MX:", 10);
    writeHeader("MY:", 10);
    writeHeader("PD:", 10);

    // extented header would go here
    // "AU:%s\r" % author)
    // "CP:%s\r" % meta_copyright)
    // "TC:%s,%s,%s\r" % (thread.hex_color(), thread.description, thread.catalog_number))

    // end of header data
    expArr.push(0x1a);

    // Print remaining empty header
    for (var i = 0; i < 387; i++) {
        expArr.push(0x20);
    }

    var origin = {},
        weJustChangedColors = false;

    hasFirst = false;

    for (i = 0; i < cache.length; i++) {
        if (cache[i].cmd == "color" && !ignoreColors) {
            expArr.push(0x00);
            expArr.push(0x00);
            expArr.push(0xC3);
            weJustChangedColors = true;
        } else if (cache[i].cmd == "move") {

            var stitch = cache[i];

            if (!hasFirst) { //  create a stitch at origin
                origin.x = Math.round(stitch.x * scale);
                origin.y = Math.round(stitch.y * scale);

                // zero stitch: Why is it here
                encodeTajimaStitch(0, 0, !stitch.penDown);
                lastStitch = {
                    cmd: "move",
                    x: 0,
                    y: 0,
                    penDown: stitch.penDown
                };
                hasFirst = true;

            } else {
                var x1 = Math.round(stitch.x * scale) - origin.x,
                    y1 = Math.round(stitch.y * scale) - origin.y,
                    x0 = Math.round(lastStitch.x * scale) - origin.x,
                    y0 = Math.round(lastStitch.y * scale) - origin.y,

                    sum_x = 0,
                    sum_y = 0,
                    dmax = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)),
                    dsteps = Math.abs(dmax / 121);

                if (!lastStitch.penDown)
                // zero stitch: Why is it here
                    encodeTajimaStitch(0, 0, false);

                if (weJustChangedColors) {
                    // zero stitch: Why is it here
                    encodeTajimaStitch(0, 0, !stitch.penDown);
                    weJustChangedColors = false;
                }

                if (dsteps <= 1) {
                    encodeTajimaStitch((x1 - x0), (y1 - y0), !stitch.penDown);
                    count_stitches++;
                } else {
                    for (var j = 0; j < dsteps; j++) {
                        if (j < dsteps - 1) {
                            encodeTajimaStitch(
                                Math.round((x1 - x0) / dsteps),
                                Math.round((y1 - y0) / dsteps), !stitch.penDown
                            );
                            count_stitches++;
                            sum_x += (x1 - x0) / dsteps;
                            sum_y += (y1 - y0) / dsteps;
                        } else {
                            encodeTajimaStitch(
                                Math.round((x1 - x0) - sum_x),
                                Math.round((y1 - y0) - sum_y), !stitch.penDown
                            );
                            count_stitches++;
                        }
                    }
                }
            }
            lastStitch = stitch;
            hasFirst = true;
        }
    }

    // end pattern
    expArr.push(0x00);
    expArr.push(0x00);
    expArr.push(0xF3);

    // convert
    var expUintArr = new Uint8Array(expArr.length);
    for (i = 0; i < expArr.length; i++) {
        expUintArr[i] = Math.round(expArr[i]);
    }
    return expUintArr;
}

function toGCODE(cacheData, options) {
    var cache = cacheData.cache,
        originPoint = options.origin === 'first-point' ? cacheData.firstPoint : cacheData.bottomLeft,
        ppm = options.pixelsPerMillimeter || 5,
        zStep = options.zPerStitchMm || 5,
        startZ = options.startZMm || 0,
        travelFeed = options.travelFeed || 6000,
        stitchFeed = options.stitchFeed || 1800,
        currentZ = startZ,
        lines = [],
        i,
        entry,
        x,
        y,
        line;

    lines.push('; TurtleStitch Klipper G-code export');
    lines.push('; Z increases by ' + zStep + 'mm per stitch');
    lines.push('G21');
    lines.push('G90');
    lines.push('G92 Z' + startZ.toFixed(3));

    for (i = 0; i < cache.length; i++) {
        entry = cache[i];

        if (entry.cmd === 'color') {
            lines.push('; color r:' + entry.color.r + ' g:' + entry.color.g + ' b:' + entry.color.b);
            continue;
        }

        x = (entry.x - originPoint.x) / ppm;
        y = (entry.y - originPoint.y) / ppm;

        if (entry.penDown) {
            currentZ += zStep;
            line = 'G1 X' + x.toFixed(3) + ' Y' + y.toFixed(3) + ' Z' + currentZ.toFixed(3) + ' F' + stitchFeed;
        } else {
            line = 'G0 X' + x.toFixed(3) + ' Y' + y.toFixed(3) + ' F' + travelFeed;
        }

        lines.push(line);
    }

    lines.push('M400');
    lines.push('M84');

    return lines.join('\n');
}

function uploadGCodeToMoonraker(name, gcodeText, uploadOptions) {
    var url = uploadOptions.url ? uploadOptions.url.replace(/\/$/, '') : '',
        headers = {},
        formData,
        path;

    if (!url) {
        return Promise.reject(new Error('No Moonraker URL provided'));
    }

    formData = new FormData();
    formData.append('file', new Blob([gcodeText], {type: 'text/plain'}), name + '.gcode');

    path = uploadOptions.path || 'gcodes';
    if (path) {
        formData.append('path', path);
    }

    if (uploadOptions.apiKey) {
        headers['X-Api-Key'] = uploadOptions.apiKey;
    }

    return fetch(url + '/server/files/upload', {
        method: 'POST',
        body: formData,
        headers: headers
    }).then(response => {
        if (!response.ok) {
            throw new Error('Moonraker upload failed with status ' + response.status);
        }
        return response.json ? response.json() : response;
    });
}

function exportEmbroideryGCode(trailsLog, name = 'unnamed', options = {}) {
    var cfg = Object.assign({
            pixelsPerMillimeter: 5,
            zPerStitchMm: 5,
            startZMm: 0,
            travelFeed: 6000,
            stitchFeed: 1800,
            origin: 'bottom-left',
            moonraker: null,
            downloadFallback: true
        }, options || {}),
        cacheData,
        gcode,
        blob,
        moonrakerUrl;

    // Check for empty drawing
    if (!trailsLog || trailsLog.length === 0) {
        alert('No stitches to export! Please draw something first.');
        return;
    }

    cacheData = buildEmbroideryCache(trailsLog);
    gcode = toGCODE(cacheData, cfg);

    // Auto-detect Moonraker URL from current hostname
    if (!cfg.moonraker) {
        moonrakerUrl = 'http://' + (window.location.hostname || 'localhost') + ':7125';
        cfg.moonraker = { url: moonrakerUrl, path: 'gcodes' };
    }

    console.log('G-code export: ' + cacheData.cache.length + ' commands, uploading to ' + cfg.moonraker.url);

    if (cfg.moonraker && cfg.moonraker.url) {
        uploadGCodeToMoonraker(name, gcode, cfg.moonraker)
            .then(response => {
                console.log('Upload success:', response);
                if (cfg.moonraker.onSuccess) {
                    cfg.moonraker.onSuccess();
                } else {
                    alert('G-code uploaded to printer successfully!\n' + cacheData.steps + ' stitches');
                }
            })
            .catch(err => {
                console.error('Upload failed:', err);
                alert('Upload failed: ' + err.message + '\nDownloading file instead.');
                if (cfg.downloadFallback) {
                    blob = new Blob([gcode], {type: 'text/plain'});
                    saveAs(blob, name + '.gcode');
                }
            });
        return;
    }

    blob = new Blob([gcode], {type: 'text/plain'});
    saveAs(blob, name + '.gcode');
}

function toEXP(cache, pixels_per_millimeter = 5, ignoreColors = true) {
    /*
    exports cache to DST embroidery format
    returns UintArray suitable for Blob 
    */

    var expArr = [],
        //pixels_per_millimeter = 5; //this.pixels_per_millimeter;
        scale = 10 / pixels_per_millimeter,
        lastStitch = null,
        hasFirst = false,
        weJustChangedColors = false,
        origin = {};

    function move(x, y) {
        y *= -1;
        if (x < 0) x = x + 256;
        expArr.push(Math.round(x));
        if (y < 0) y = y + 256;
        expArr.push(Math.round(y));
    }

    for (var i = 0; i < cache.length; i++) {

        if (cache[i].cmd == "color" && !ignoreColors) {
            expArr.push(0x80);
            expArr.push(0x01);
            expArr.push(0x00);
            expArr.push(0x00);
            weJustChangedColors = true;

        } else if (cache[i].cmd == "move") {

            var stitch = cache[i];

            if (!hasFirst) {
                origin.x = Math.round(stitch.x * scale);
                origin.y = Math.round(stitch.y * scale);

                // remove zero stitch - why is it here?
                //if (!stitch.penDown) {
                //  expArr.push(0x80);
                //  expArr.push(0x04);
                //}
                //move(0,0);         

                lastStitch = {
                    cmd: "move",
                    x: 0,
                    y: -0,
                    penDown: stitch.penDown
                };
                hasFirst = true;

            } else if (hasFirst) {
                var x1 = Math.round(stitch.x * scale) - origin.x,
                    y1 = -Math.round(stitch.y * scale) - origin.y,
                    x0 = Math.round(lastStitch.x * scale) - origin.x,
                    y0 = -Math.round(lastStitch.y * scale) - origin.y,

                    sum_x = 0,
                    sum_y = 0,
                    dmax = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)),
                    dsteps = Math.abs(dmax / 127);

                // remove zero stitch - why is it here?
                //if (!lastStitch.penDown)
                //	move(0,0);

                if (weJustChangedColors) {
                    // remove zero stitch - why is it here?
                    //	if (!stitch.penDown) {
                    //               expArr.push(0x80);
                    //                expArr.push(0x04);
                    //            }
                    //	move(0,0);
                    weJustChangedColors = false;
                }

                if (dsteps <= 1) {
                    if (!stitch.penDown) {
                        expArr.push(0x80);
                        expArr.push(0x04);
                    }
                    move(Math.round(x1 - x0), Math.round(y1 - y0));
                } else {
                    for (var j = 0; j < dsteps; j++) {
                        if (!stitch.penDown) {
                            expArr.push(0x80);
                            expArr.push(0x04);
                        }
                        if (j < dsteps - 1) {
                            move((x1 - x0) / dsteps, (y1 - y0) / dsteps);
                            sum_x += (x1 - x0) / dsteps;
                            sum_y += (y1 - y0) / dsteps;
                        } else {
                            move(Math.round((x1 - x0) - sum_x), Math.round((y1 - y0) - sum_y));
                        }
                    }
                }
            }
            lastStitch = stitch;
            hasFirst = true;
        }
    }

    var expUintArr = new Uint8Array(expArr.length);
    for (i = 0; i < expArr.length; i++) {
        expUintArr[i] = Math.round(expArr[i]);
    }
    return expUintArr;
}
