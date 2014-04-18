
if (typeof require !== 'undefined') {
  var Vec2 = require('vec2');
  var segseg = require('segseg');
  var Line2 = require('line2');
}

var PI = Math.PI;
var TAU = PI*2;
var toTAU = function(rads) {
  if (rads<0) {
    rads += TAU;
  }

  return rads;
};

var isArray = function (a) {
  return Object.prototype.toString.call(a) === "[object Array]";
}

var isFunction = function(a) {
  return typeof a === 'function';
}

var defined = function(a) {
  return typeof a !== 'undefined';
}


function Polygon(points) {
  if (points instanceof Polygon) {
    return points;
  }

  if (!(this instanceof Polygon)) {
    return new Polygon(points);
  }

  if (!Array.isArray(points)) {
    points = (points) ? [points] : [];
  }

  this.points = points.map(function(point) {
    if (Array.isArray(point)) {
      return Vec2.fromArray(point);
    } else if (!(point instanceof Vec2)) {
      if (typeof point.x !== 'undefined' &&
          typeof point.y !== 'undefined')
      {
        return Vec2(point.x, point.y);
      }
    } else {
      return point;
    }
  });
}

Polygon.prototype = {
  each : function(fn) {
    for (var i = 0; i<this.points.length; i++) {
      if (fn.call(this, this.point(i-1), this.point(i), this.point(i+1), i) === false) {
        break;
      }
    }
    return this;
  },

  point : function(idx) {
    var el = idx%(this.points.length);
    if (el<0) {
      el = this.points.length + el;
    }

    return this.points[el];
  },

  dedupe : function(returnNew) {
    var seen = {};
    // TODO: make this a tree
    var points = this.points.filter(function(a) {
      var key = a.x + ':' + a.y;
      if (!seen[key]) {
        seen[key] = true;
        return true;
      }
    });

    if (returnNew) {
      return new Polygon(points);
    } else {
      this.points = points;
      return this;
    }
  },

  remove : function(vec) {
    this.points = this.points.filter(function(point) {
      return point!==vec;
    });
    return this;
  },

  // Remove identical points occurring one after the other
  clean : function(returnNew) {
    var last = this.point(-1);

    var points = this.points.filter(function(a) {
      var ret = false;
      if (!last.equal(a)) {
        ret = true;
      }

      last = a;
      return ret;
    });

    if (returnNew) {
      return new Polygon(points);
    } else {
      this.points = points
      return this;
    }
  },

  simplify : function() {
    var clean = function(v) {
      return Math.round(v * 10000)/10000;
    }

    var collinear = function(a, b, c) {
      var r = a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y);
      return clean(r) === 0;
    };

    this.points = this.points.filter(Boolean);

    var newPoly = [];
    for (var i = 0; i<this.points.length; i++) {
      var p = this.point(i-1);
      var n = this.point(i+1);
      var c = this.point(i);

      var angle = c.subtract(p, true).angleTo(c.subtract(n, true));

      if (!collinear(p, c, n) && clean(angle)) {
        newPoly.push(c);
      }
    }

    this.points = newPoly;
    return this;
  },

  winding : function() {
    return this.area() > 0;
  },

  rewind : function(cw) {
    cw = !!cw;
    var winding = this.winding();
    if (winding !== cw) {
      this.points.reverse();
    }
    return this;
  },

  area : function() {
    var area = 0;
    var first = this.point(0);

    this.each(function(prev, current, next, idx) {
      if (idx<2) { return; }

      var edge1 = first.subtract(current, true);
      var edge2 = first.subtract(prev, true);
      area += ((edge1.x * edge2.y) - (edge1.y * edge2.x));
    });

    return area/2;
  },

  closestPointTo : function(vec) {
    var points = [],
        l = this.points.length,
        dist = Infinity,
        found = null,
        foundIndex = 0,
        foundOnPoint = false,
        i;

    for (i=0; i<l; i++) {

      var a = this.point(i-1);
      var b = this.point(i);
      var ab = b.subtract(a, true);
      var veca = vec.subtract(a, true);
      var vecadot = veca.dot(ab);
      var abdot = ab.dot(ab);

      var t = Math.min(Math.max(vecadot/abdot, 0), 1);

      var point = ab.multiply(t).add(a);
      var length = vec.subtract(point, true).lengthSquared();

      if (length < dist) {
        found = point;
        foundIndex = i;
        foundOnPoint = t===0 || t===1;
        dist = length;
      }
    }

    found.prev = this.point(foundIndex-1);
    found.next = this.point(foundIndex+1);

    if (foundOnPoint) {
      found.current = this.point(foundIndex);
    }

    return found;
  },

  center : function() {
    // TODO: the center of a polygon is not the center of it's aabb.
    var aabb = this.aabb();
    return Vec2(aabb.x + aabb.w/2, aabb.y + aabb.h/2);
  },

  scale : function(amount, origin, returnTrue) {
    var obj = this;
    if (returnTrue) {
      obj = this.clone();
    }

    if (!origin) {
      origin = obj.center();
    }

    obj.each(function(p, c) {
      c.multiply(amount);
    });

    var originDiff = origin.multiply(amount, true).subtract(origin);

    obj.each(function(p, c) {
      c.subtract(originDiff);
    });

    return obj;
  },

  containsPoint : function(point) {
    var c = false;

    this.each(function(prev, current, next) {
      ((prev.y <= point.y && point.y < current.y) || (current.y <= point.y && point.y < prev.y))
        && (point.x < (current.x - prev.x) * (point.y - prev.y) / (current.y - prev.y) + prev.x)
        && (c = !c);
    });

    return c;
  },

  containsPolygon : function(subject) {
    if (isArray(subject)) {
      subject = new Polygon(subject);
    }

    for (var i=0; i<subject.points.length; i++) {
      if (!this.containsPoint(subject.points[i])) {
        return false;
      }
    }

    for (var i=0; i<this.points.length; i++) {
      var outer = this.line(i);
      for (var j=0; j<subject.points.length; j++) {
        var inner = subject.line(j);

        var isect = segseg(outer[0], outer[1], inner[0], inner[1]);
        if (isect && isect !== true) {
          return false;
        }
      }
    }

    return true;
  },


  aabb : function() {
    if (this.points.length<2) {
      return { x: 0, y : 0, w: 0, h: 0};
    }

    var xmin, xmax, ymax, ymin, point1 = this.point(1);

    xmax = xmin = point1.x;
    ymax = ymin = point1.y;

    this.each(function(p, c) {
      if (c.x > xmax) {
        xmax = c.x;
      }

      if (c.x < xmin) {
        xmin = c.x;
      }

      if (c.y > ymax) {
        ymax = c.y;
      }

      if (c.y < ymin) {
        ymin = c.y;
      }
    });

    return {
      x : xmin,
      y : ymin,
      w : xmax - xmin,
      h : ymax - ymin
    };
  },

  offset : function(delta) {
    var bisect = function(a, b) {
      var diff = a.subtract(b, true);
      var angle = toTAU(Vec2(1, 0).angleTo(diff));
      var bisector = Vec2(delta, 0).rotate(angle - Math.PI/2);

      return bisector;
    };

    var parline = function(a, b) {
      var normal = a.subtract(b, true);

      var angle = Vec2(1, 0).angleTo(normal);
      var bisector = Vec2(delta, 0).rotate(angle + Math.PI/2);

      bisector.add(b);

      var cperp = bisector.add(normal, true);

      var l = new Line2(bisector.x, bisector.y, cperp.x, cperp.y);
      var n = a.add(normal, true);
      var l2 = new Line2(a.x, a.y, n.x, n.y);
      return l;
    }

    var ret = [];
    var collect = function(a, point, type) {
      if (a) {
        ret.push(a);
        if (point) {
          a.point = point;
        }
        a.type = type || 'edge';
      }
    }

    var lines = [];
    this.rewind(false).simplify().each(function(p, c, n, i) {

      var e1 = c.subtract(p, true).normalize();
      var e2 = c.subtract(n, true).normalize();

      var r = delta / Math.sin(Math.acos(e1.dot(e2))/2);
      var d = e1.add(e2, true).normalize().multiply(r, true);

      var angle = toTAU(e1.angleTo(e2));
      var o = e1.perpDot(e2) < 0 ? c.add(d, true) : c.subtract(d, true);

      var bc = bisect(c, n);
      var nc = bisect(n, this.point(i+2));

      var start = c.subtract(bc, true);
      var end = n.subtract(bc, true);

      if (delta > 0) {
        angle = TAU-angle;
      }

      if (delta < 0) {
        if (angle <= TAU * .85 && angle >= TAU * .15) {
          collect(o, c, 'angle');
        }
        collect(start, c); // edge offset
        collect(end, n); // edge offset

      } else  {
        if (angle <= TAU/4) {
          collect(o, c, 'angle');
        }
        collect(start, c); // edge offset
        collect(end, n); // edge offset
      }
    });

    var poly = Polygon(ret).simplify();
    var l = poly.points.length;


    // TODO: optimize by only attempting isect when
    //       on an edge offset
    ret = [];
    for (var i=0; i<l; i++) {
      var pp = poly.point(i-2);
      var p = poly.point(i-1);
      var c = poly.point(i);
      var n = poly.point(i+1);
      var nn = poly.point(i+2);
      var nnn = poly.point(i+3);

      var ppnn = segseg(pp, p, n, nn);
      var ppnnn = segseg(pp, p, nnn, nn);
      var pcnn = segseg(p, c, n, nn);
      var ppcn = segseg(p, pp, n, c);

      if (ppnnn) {
        i+=2;
        collect(Vec2.fromArray(ppnnn))
        continue;
      } else if (ppnn) {
        i+=1;
        collect(Vec2.fromArray(ppnn));
        continue;
      } else if (pcnn) {
        i+=1;
        collect(Vec2.fromArray(pcnn))

        continue;
      }

      collect(c);
    }

    return Polygon(ret).simplify();
  },

  line : function(idx) {
    return [this.point(idx), this.point(idx+1)];
  },

  lines : function(fn) {
    var idx = 0;
    this.each(function(p, start, end) {
      fn(start, end, idx++);
    });

    return this;
  },

  selfIntersections : function() {
    var ret = [];
    var poly = this;
    var l = this.points.length+1;
    // TODO: use a faster algorithm. Bentley–Ottmann is a good first choice
    for (var i = 0; i<l; i++) {
      var s = this.point(i);
      var e = this.point(i+1);

      for (var i2 = i+1; i2<l; i2++) {
        var s2 = this.point(i2);
        var e2 = this.point(i2+1);
        if (e2 === e || s === s2 || e === s2 || s === e2) {
          continue;
        }

        var isect = segseg(s, e, s2, e2);


        // self-intersection
        if (isect && isect !== true) {
          var vec = Vec2.fromArray(isect);
          // TODO: wow, this is inneficient but is crucial for creating the
          //       tree later on.
          vec.s = i + (s.subtract(vec, true).length() / s.subtract(e, true).length())
          vec.b = i2 + (s2.subtract(vec, true).length() / s2.subtract(e2, true).length())
          vec.si = i;
          vec.bi = i2;

          ret.push(vec);
        }
      }
    }
    var poly = Polygon(ret).clean();
    return poly;
  },

  pruneSelfIntersections : function(validFn) {
    var selfIntersections = this.selfIntersections();
    this.simplify();

    if (!selfIntersections.points.length) {
      return [this];
    }

    var belongTo = function(s1, b1, s2, b2) {
      return s1 > s2 && b1 < b2
    }

    var contain = function(s1, b1, s2, b2) {
      return s1 < s2 && b1 > b2;
    }

    var interfere = function(s1, b1, s2, b2) {
      return (s1 < s2 && s2 < b1 && b2 > b1) || (s2 < b1 && b1 < b2 && s1 < s2);
    }

    var node_set_array = function(node, key, value) {
      if (!node[key]) {
        node[key] = [value];
      } else {
        node[key].push(value);
      }
    }

    var compare = function(a, b) {
      if (belongTo(a.s, a.b, b.s, b.b)) {
        return 'belongs';
      } else if (contain(a.s, a.b, b.s, b.b)) {
        return 'contains';
      } else if (interfere(a.s, a.b, b.s, b.b)) {
        return 'interferes'
      } else {
        return null;
      }
    }

    var node_associate = function(node, child) {
      if (!node) {
        return true;
      }

      var relationship = compare(node, child);
      console.log('%s:%s -> %s:%s :: %s', node.id, node.toString(), child.id, child.toString(), relationship);
      if (relationship) {

        if (relationship === 'contains') {
          child.parent = node;
          node_set_array(node, relationship, child);
          return true;
        }

        if (relationship === 'interferes') {

          // TODO: there are other cases
          //       consider keeping track of all the interference
          if (node.contains && node.contains.length) {
            console.log('REPARENTING', node.contains[0], child);

            node_reparent(node.contains[0], child);
            node_reparent(child, node);
            // node.contains.forEach(function(contained) {
            //   node_reparent(contained, child)
            // });
            // node_reparent(child, node);
            console.log(compare(child, node));
            return true;
            node_set_array(node.contains[0], 'contains', child);
            return true;
          }
        }
      }
    }

    var node_reparent = function(node, parent) {
      if (node.parent) {
        node.parent.contains = node.parent.contains.filter(function(n) {
          return n !== node;
        });
      }

      if (!parent.contains) {
        parent.contains = [];
      }

      if (!node.contains) {
        node.contains = [];
      }

      var oldParent = node.parent || null;
      node.parent = parent;
      parent.contains.push(node);
      return oldParent;
    };

    // TODO: ensure the root node is valid
    var root = this.point(0);

    var points = selfIntersections.points.concat();

    var startCompareAt = 0;
    var rootIsValid = validFn && validFn(root);


    if (!rootIsValid) {//} || this.winding()) {
      console.warn('SELECTING A NEW ROOT');
      var index = points.length-1;
      root = points[index];
      while (!validFn(root) && index--) {
        root = points[index];
      }

      // no valid start points found, bail out
      if (index == -1) {
        return [];
      }

      points = points.slice(index-1);

    } else {
      root.s = 0;
      root.si = 0;
      root.bi = (this.points.length-1); + 0.99;
      root.b = root.bi + 0.99;

      points.unshift(root);
    }


    points.sort(function(a, b) {
      return a.s < b.s ? -1 : 1;
    });

    // this.point(root.si).color = "#f0f"
    // this.point(root.si).radius = 15;

    for (var i=1; i<points.length; i++) {
      if (!node_associate(points[i-1], points[i])) {
        node_reparent(points[i], points[i-1]);
        // var parent = points[i-1].parent;

        // while (parent) {
        //   if (node_associate(parent, points[i])) {
        //     console.log('missed, but found')
        //     break;
        //   }
        //   parent = parent.parent;
        // }
      };
    }

    console.log('ROOT NODE', root);

    var polygons = [];
    var that = this;
    var walk1 = function(node, depth) {
      var odd = !!(depth%2)

      var contains = node.contains || [];
      var i;
      if (!odd) {
        var poly = [];
        var collect = function(n, id) {
          console.log('collected', id || n.id, n.toArray(), 'line: ' + (new Error()).stack.split('\n')[2].split('js:').pop().split(':').shift());
          poly.push(n);
        }

        depth > 0 && collect(node, node.si + '->' + node.bi);
        // console.log('contains.length', contains.length, contains.join(','), contains[0], node);
        if (contains.length) {
          if (depth === 0) {
            for (i=node.si; i<=contains[0].bi; i++) {
              collect(that.points[i], 'first-' + i);
            }
          }
          // Ok, here we're going to special case the situation where
          // we've had to move past the root node to start the collection
          // process.
          if (root.si !== 0) {
            collect(node, 'root');
          }

          for (i=0; i<contains.length; i++) {
            collect(contains[i], 'contains-' + i);

            if (depth !== 0) {
              var next = contains[i+1];
              var collectTo = next ? next.si : node.bi;
              for (var j=contains[i].bi; j<collectTo; j++) {
                collect(that.points[j], i + ' :: ' + j);
              }
            }

            if (contains[i].contains) {
              //console.log('contains', contains[i].contains, i, contains[i].contains.length);

              for (var j=0; j<contains[i].contains.length; j++) {
                console.log('WALKING', depth+2, contains[i].contains[j])
                walk(contains[i].contains[j], depth+2);
              }
            } else {
              // Collect to the next contains
              if (i === contains.length-1) {

                // for (var j = contains[i].bi; j<node.bi; j++) {
                //   console.log('collect', that.point(j).toString())
                //   collect(that.point(j));
                // }

                console.log('MISS', that.points.length, node.si, node.bi, contains[i].si, contains[i].bi);
                console.log('poly length', poly.join(';'))
              }

            }
            // no else here because the next phase is even
          }

          depth !== 0 && collect(that.point(node.bi), node.id + '.b');
        } else {
          collect(node, 'node');

          for (var i = node.si; i<node.bi; i++) {
            collect(that.point(i), 'node-' + i);
          }
          collect(that.point(node.bi), 'node-bi-' + node.bi);
        }

        if (poly.length > 2) {
          poly[0].color = "green";
          poly[0].radius = 10;
          console.error('POLY', poly.join());
          var cleanedPolygon = new Polygon(poly);
          //if (!cleanedPolygon.winding()) {
            polygons.push(cleanedPolygon);
          //}
        } else {
          console.log('miss because size', poly.join(','))
        }
      }
    };

    var walk = function(node) {

      var poly = [];
      var collect = function(n, id) {
        console.log('collected', id || n.id, n.toString(), 'line: ' + (new Error()).stack.split('\n')[2].split('js:').pop().split(':').shift());
        poly.push(n);
      };

      var contains = node.contains || [];

      if (contains.length) {
        var i, j;

        node.parent && collect(node);

        for (j = 0; j<contains.length; j++) {
          // TODO: need to i<=contains[i] for the right
          //       but it breaks other stuff
          for (i = node.si; i<=contains[j].si; i++) {
            collect(that.points[i], 'up to next');
          }

          if (node.si === 0) {
            poly.pop();
            collect(that.points[contains[j].si]);
          } else if (!node.parent) {
            poly.pop();
            collect(node);
          }

          if (contains[j].contains) {
            for (var k = 0; k<contains[j].contains.length; k++) {
              walk(contains[j].contains[k]);
            }
          }
        }

        collect(contains[contains.length-1], 'isect point');

        for (i = contains[contains.length-1].bi+1; i<=node.b; i++) {
          collect(that.points[i], 'back to node');
        }

      } else {


        console.warn('TODO', node.si, node.bi, node.parent.si, node.parent.bi);

        if (node.parent.bi - node.bi <= 1 && node.parent.si - node.si <= 1) {

          for (var i = node.parent.bi; i <= node.si; i++) {
            collect(that.points[i], 'TODO');
          }

          for (var i = node.si-1; i<=node.bi; i++) {
            collect(that.points[i], 'TODO');
          }


          collect(node);


          for (var i = node.bi; i <= parent.si; i++) {
            collect(that.points[i], 'TODO');
          }

        } else {

          for (var i = node.si; i<=node.bi; i++) {
            collect(that.points[i], 'TODO');
          }

          collect(node);
        }
      }
console.log(poly.join(';'));
      var polygon = new Polygon(poly).simplify();
      if (!polygon.winding()) {
        polygons.push(polygon);
      } else {
        console.log('failed due to winding')
      }

    };

    walk(root)
    return polygons;
  },

  get length() {
    return this.points.length
  },

  clone : function() {
    var points = [];
    this.each(function(p, c) {
      points.push(c.clone());
    });
    return new Polygon(points);
  },

  rotate: function(rads, origin, returnNew) {
    origin = origin || this.center();

    var obj = (returnNew) ? this.clone() : this;

    return obj.each(function(p, c) {
      c.subtract(origin).rotate(rads).add(origin);
    });
  },

  translate : function(vec2, returnNew) {
    var obj = (returnNew) ? this.clone() : this;

    obj.each(function(p, c) {
      c.add(vec2);
    });

    return obj;
  },

  equal : function(poly) {
    var current = poly.length;

    while(current--) {
      if (!this.point(current).equal(poly.point(current))) {
        return false;
      }
    }
    return true;
  },


  containsCircle : function(x, y, radius) {
    var position = new Vec2(x, y);

    // Confirm that the x,y is inside of our bounds
    if (!this.containsPoint(position)) {
      return false;
    }

    var closestPoint = this.closestPointTo(position);

    if (closestPoint.distance(position) >= radius) {
      return true;
    }
  },

  contains : function(thing) {

    if (!thing) {
      return false;
    }

    // Other circles
    if (defined(thing.radius) && thing.position) {
      var radius;
      if (isFunction(thing.radius)) {
        radius = thing.radius();
      } else {
        radius = thing.radius;
      }

      return this.containsCircle(thing.position.x, thing.position.y, radius);

    } else if (typeof thing.points !== 'undefined') {

      var points, l;
      if (isFunction(thing.containsPolygon)) {
        points = thing.points;
      } else if (isArray(thing.points)) {
        points = thing.points;
      }

      return this.containsPolygon(points);

    } else if (
      defined(thing.x1) &&
      defined(thing.x2) &&
      defined(thing.y1) &&
      defined(thing.y2)
    ) {
      return this.containsPolygon([
        new Vec2(thing.x1, thing.y1),
        new Vec2(thing.x2, thing.y1),
        new Vec2(thing.x2, thing.y2),
        new Vec2(thing.x1, thing.y2)
      ]);

    } else if (defined(thing.x) && defined(thing.y)) {

      var x2, y2;

      if (defined(thing.w) && defined(thing.h)) {
        x2 = thing.x+thing.w;
        y2 = thing.y+thing.h;
      }

      if (defined(thing.width) && defined(thing.height)) {
        x2 = thing.x+thing.width;
        y2 = thing.y+thing.height;
      }

      return this.containsPolygon([
        new Vec2(thing.x, thing.y),
        new Vec2(x2, thing.y),
        new Vec2(x2, y2),
        new Vec2(thing.x, y2)
      ]);
    }

    return false;
  },

  toString : function() {
    return this.points.join(',');
  }

};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Polygon;
}

if (typeof window !== 'undefined') {
  window.Polygon = Polygon;
}
