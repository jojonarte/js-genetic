if ( typeof console == 'undefined' ) console = { log: function() {} };

//                                                                                          CONSTANT VARIABLES
// ===========================================================================================================

// Rendering options
    SPEED = 0;
    SHADOWS = false;

// Movement Limitations
    MAX_TURN = Math.PI / 2;
    MAX_VELOCITY = 5;
    MIN_VELOCITY = 1;

// Entity drawing
    WEDGE_ANGLE = Math.PI * 0.25;
    ENTITY_SIZE = 12;

// Neural Tuning
    MAX_NET_LAYERS = 3;
    NEURONS_PER_LAYER = 4; // Should never be less than number of inputs (currently 4)
    MAX_AXONS = 4;
    MAX_STRENGTH = 12;
    MAX_TRIGGER = 20;
    MIN_TRIGGER = 5;
    MAX_RELAXATION = 99;
    THOUGHTS_PER_MOVE = 64;

// Genetics and Population
    POPULATION_SIZE = 64;
    MUTATION_RATE = 1.5;
    MUTATION_DELTA = 4.0;
    PRECISION = 2;
    SEX = false;

// Perceptual Limatations
    FIELD_OF_VIEW = Math.PI;
    VIEW_DISTANCE = 192;

// Food, Metabolism, Aging
    MIN_FOOD_SIZE = 4;
    MAX_FOOD_SIZE = 6;
    FOOD_COUNT = 24;
    STARVATION_LENGTH = 600;
    OLD_AGE = 8192;
    ENERGY_COST = 1.5;

// World Boundary Handling
    CAN_WANDER = true;
    TELEPORT = true;

// Graphs and Reporting
    REPORTING_RATE = 100;
    HISTORY_LENGTH = 384;
    NODE_RADIUS = 18;

//                                                                                            GLOBAL VARIABLES
// ===========================================================================================================

var mainLoop;

// Canvas globals
    var context;
    var canvas;

// Statistics
    var born = 0;
    var eaten = 0;
    var natural = 0;
    var starved = 0;
    var wandered = 0;
    var lowScore = 0; // Only used for graph drawing
    var highScore = 0;
    var iteration = 0;
    var historyList = [];
    var mutationCount = 0;

// Time Keeping
    var startTime = new Date();
    var timeStamp = startTime.getTime() / 1000;

//                                                                                            GENESIS FUNCTION
// ===========================================================================================================

function genesis() {
    canvas = document.getElementById('world');

    // Do initial canvas sizing
    window.onresize();

    // Hide wander column if unneeded
    if ( ! CAN_WANDER ) {
        document.getElementById('stats-area').className = 'noWander';
    }

    // Check browser compatability
    if ( !canvas || !canvas.getContext ) {
        alert("Sorry, you're browser can't run this demo.  Please try the lastest Firefox or Chrome browser instead");
        return;
    }

    // Get the canvas context
    context = canvas.getContext('2d');

    // Activate tooltips for the diagram
    setDiagramMouseHandlers();

    // Activate hover animation for time
    counterHover();

    // Create our population
    population = new Population();
    mainLoop = setInterval( function() {
        // Keep track of our iteration count
        iteration++;

        // Clear the drawing area
        context.clearRect( 0, 0, canvas.width, canvas.height );

        // Draw the food supply
        population.foodSupply.draw();

        // Run a tick of population life cycle
        population.run();

        drawCounters();

        updateGraph();
        updateDiagram();

        printStats();
    }, SPEED );
}

//                                                                                            POPULATION CLASS
// ===========================================================================================================

function Population( foodSupply ) {
    this.entities = [];

    if ( typeof( foodSupply == 'undefined' ) ) {
        this.foodSupply = new FoodSupply();
    } else {
        this.foodSupply = foodSupply;
    }

    // Fill our population with entities
    for ( var i = 0; i < POPULATION_SIZE; i++ ) {
        var entity = new Entity;
        entity.population = this;
        this.entities.push( entity );
    }
}

Population.prototype.run = function() {
    this.sortSuccess();
    for ( var i = 0; i < this.entities.length; i++ ) {
        var entity = this.entities[ i ];

        entity.think();
        entity.move();
        entity.eat( this.foodSupply );
        entity.draw();

        // Check entity lifecycle and replace dead entities
        if ( ! entity.live() ) {

            // Copy the genome of a random winner
            var winningGenome = this.findWinner();
            var newGenome = new Genome( winningGenome );

            // Mutate it
            newGenome.mutate();

            // Spawn a new entity from it
            var newEntity = new Entity( newGenome );

            // Associate the entity with our population
            newEntity.population = this;

            // Put it back in the array
            this.entities[ i ] = newEntity;
        }
    }
}

Population.prototype.sortSuccess = function() {
    this.entities.sort( function( a, b ) {
        return b.life.f - a.life.f;
    });
}

Population.prototype.findWinner = function() {
    var weightedList = [];
    for ( i in this.entities ) {
        var entity = this.entities[ i ];
        var successFactor = entity.life.f;
        for ( var j = 0; j < successFactor; j++ ) {
            weightedList.push( entity );
        }
    }
    if ( weightedList.length > 0 ) {
        var winner = weightedList[ Math.floor( Math.random() * weightedList.length ) ];
        return winner.genome;
    } else {
        return new Genome();
    }
}

//                                                                                                ENTITY CLASS
// ===========================================================================================================

function Entity( genome ) {
    // Increment birth counter
    born++;

    // Record genome
    this.genome = new Genome( genome );

    // Generate the entities brain using provided genome
    this.brain = [];
    for ( i = 0; i < MAX_NET_LAYERS; i++ ) {
        var layer = [];
        for ( j = 0; j < NEURONS_PER_LAYER; j++ ) {
            var a = [];
            var g = this.genome.genes[ ( i * NEURONS_PER_LAYER ) + j ];
            for ( k in g.a ) {
                var ga = g.a[k];
                a.push({ x: ga.x, y: ga.y, s: ga.s });
            }
            layer.push( { a: a, t: g.t, e: 0, r: g.r } );
        }
        this.brain.push( layer );
    }

    this.position = {
        // Starting position and angle
         x: canvas.width * Math.random()
        ,y: canvas.height * Math.random()
        ,a: Math.random() * Math.PI * 2
    }

    this.output = {
        // Movement counters
         al: 0  // Left angle
        ,ar: 0  // Right angle
        ,v:  0  // Velocity accelerator
        ,vn: 0  // Velocity suppressor
        ,ov: 0  // Keep track of last velocity to extract energy cost
    }

    // Set life cycle parameters
    this.life = {
         f: 0   // Food eaten
        ,l: 1   // Lifespan
        ,h: 0   // Hunger
    }
}

// Process Entity lifecycle
Entity.prototype.live = function() {
    // Increment life counter
    this.life.l++;

    ww = canvas.width;
    wh = canvas.height;
    e = this.position;

    if ( e.x > ww || e.x < 0 || e.y > wh || e.y < 0 ) {
        wandered++;
        return false;
    }

    // Randomly kill entities if it's exceeded starvation threshold
    if ( this.life.h > STARVATION_LENGTH ) {
        // Vulnerable entities have 1/100 chance of death
        if ( Math.random() * 100 <= 1 ) {
            starved++;
            return false;
        }
    // Randomly kill entities who've entered old age
    } else if ( this.life.l > OLD_AGE ) {
        // Vulnerable entities have 1/100 chance of death
        if ( Math.random() * 100 <= 1 ) {
            natural++;
            return false;
        }
    }
    return true;
}

Entity.prototype.findFood = function() {

    if ( typeof( this.population ) == 'undefined' ) console.log( this );
    var foodSupply = this.population.foodSupply;

    // An array of vectors to foods from this entity's perspective
    var foodVectors = [];

    // Simplify reference to entity's position using 'e' variable
    var e = this.position;

    // Loop through foodSupply
    for ( i in foodSupply.food ) {
        var f = foodSupply.food[i];

        // Find polar coordinates of food relative this entity
        var dx = f.x - e.x; if ( dx == 0 ) dx = 0.000000000001;
        var dy = f.y - e.y;

        // Check bounding box first for performance
        if ( Math.abs( dx ) < VIEW_DISTANCE && Math.abs( dy ) < VIEW_DISTANCE ) {

            // Find angle of food relative to entity
            var angle = e.a - Math.atan2( dy, dx );

            // Convert angles to right of center into negative values
            if ( angle > Math.PI ) angle -= 2 * Math.PI;

            // Calculate distance to this food
            var distance = Math.sqrt( dx * dx + dy * dy );

            // If the food is in viewing range add it to our list
            if ( Math.abs( angle ) <= FIELD_OF_VIEW / 2 && distance <= VIEW_DISTANCE ) {
                foodVectors.push({
                     distance: distance
                    ,angle: angle
                    ,food: f
                });
            }
        }
    }

    // Sort our food vectors by distance
    return foodVectors.sort( function( a, b ) {
        return a.distance - b.distance;
    });
}

Entity.prototype.think = function() {
    var foodList = this.findFood();

    // All inputs should be a value of 0 to 1
    var inputs = [
        // left
         typeof( foodList[0] ) == 'undefined' || foodList[0].angle < 0 ? 0 :
            ( Math.abs( foodList[0].angle ) / ( FIELD_OF_VIEW / 2 ) )

        // distance
        ,typeof( foodList[0] ) == 'undefined' ? 0 :
            ( ( VIEW_DISTANCE - foodList[0].distance ) / VIEW_DISTANCE )

        // right
        ,typeof( foodList[0] ) == 'undefined' || foodList[0].angle > 0 ? 0 :
            ( Math.abs( foodList[0].angle ) / ( FIELD_OF_VIEW / 2 ) )

        // distance to wall
        ,( VIEW_DISTANCE - this.wallDistance() ) / VIEW_DISTANCE
    ];

    // Normalize inputs to MAX_STRENGTH
    for ( i in inputs ) {
        inputs[ i ] = inputs[ i ] * MAX_STRENGTH;
    }

    // Run through the brain layers once for each 'thought'
    for ( var thought = 0; thought < THOUGHTS_PER_MOVE; thought++ ) {

        for ( var i = 0; i < this.brain.length; i++ ) {
            var layer = this.brain[ i ];
            for ( j = 0; j < layer.length; j++ ) {
                var neuron = layer[ j ];

                // Activate inputs if this is the first layer
                if ( i == 0 ) {
                    neuron.e += isNaN( inputs[ j ] ) ? 0 : inputs[ j ];
                }

                // Fire neurons that exceed threshold
                if ( neuron.e > neuron.t ) {
                    // Handle motor neurons
                    if ( i == this.brain.length - 1) {
                        // Zero excitation
                        neuron.e = 0;
                        // Increment motor counter
                        this.output[ [ 'al', 'v' ,'ar', 'vn' ][ j ] ]++;
                    } else {
                        // Fire axons
                        for ( k in neuron.a ) {
                            a = neuron.a[k];
                            var target = this.brain[ i + 1 ][ a.x ];
                            target.e += neuron.a[k].s;

                            // Prevent negative excitation of target
                            if ( target.e < 0 ) target.e = 0;

                            // Zero excitation
                            neuron.e = 0;
                        }
                    }
                } else {
                    // Relax neuron
                    neuron.e *= neuron.r;

                    // We don't need infinitesimals
                    if ( neuron.e < 0.01 ) neuron.e = 0;
                }
            }
        }
    }
}

// Move the entity
Entity.prototype.move = function() {
    var v = 0;
    var ll = this.brain.length - 1;

    var ww = canvas.width;
    var wh = canvas.height;

    var turnIncrement = MAX_TURN / THOUGHTS_PER_MOVE;
    var velocityIncrement = ( MAX_VELOCITY - MIN_VELOCITY ) / THOUGHTS_PER_MOVE;

    this.position.a += this.output.al * turnIncrement;
    this.position.a -= this.output.ar * turnIncrement;
    var v =  this.output.v - this.output.vn;

    // Prevent reverse
    v =  MIN_VELOCITY + ( v * velocityIncrement );
    if ( v < 0 ) v = 0;
    this.output.ov = v;

    // Reset movement counters
    this.output.ar = 0;
    this.output.al = 0;
    this.output.v  = 0;
    this.output.vn = 0;

    // Keep angles within bounds
    this.position.a = this.position.a % ( Math.PI * 2 );
    if ( this.position.a < 0 ) this.position.a = ( Math.PI * 2 ) - this.position.a;

    // Convert movement vector into polar
    var dx = ( Math.cos( this.position.a ) * v );
    var dy = ( Math.sin( this.position.a ) * v );

    // Move the entity
    this.position.x += dx;
    this.position.y += dy;

    if ( ! CAN_WANDER ) {
             if ( this.position.x <= 0 )  this.position.x = TELEPORT ? ww :  0;
        else if ( this.position.x >= ww ) this.position.x = TELEPORT ?  0 : ww;
             if ( this.position.y <= 0 )  this.position.y = TELEPORT ? wh :  0;
        else if ( this.position.y >= wh ) this.position.y = TELEPORT ?  0 : wh;
    }
}

// Draw an entity on the canvas
Entity.prototype.draw = function() {
    var entitySize = ENTITY_SIZE;
    var e = this.position;

    // Find the angle 180deg of entity
    var ba = this.position.a + Math.PI;

    // Draw a halo around the current best entity
    if ( this == this.population.entities[0] ) {
        var hX = e.x + ( Math.cos( ba ) * ( entitySize / 2 ) );
        var hY = e.y + ( Math.sin( ba ) * ( entitySize / 2 ) );
        var highlight = context.createRadialGradient( hX, hY, 0, hX, hY, entitySize );
        highlight.addColorStop( 0, "rgba( 255, 255, 255, 0.6 )" );
        highlight.addColorStop( 1, "rgba( 255, 255,  255, 0.0 )" );

        context.fillStyle = highlight
        context.beginPath();
            context.arc( hX , hY, entitySize, 0, Math.PI*2, true );
        context.closePath();
        context.fill();

    }

    // Find left back triangle point
    var lx = Math.cos( ba + ( WEDGE_ANGLE / 2 ) ) * entitySize;
    var ly = Math.sin( ba + ( WEDGE_ANGLE / 2 ) ) * entitySize;

    // Find right back triangle point
    var rx = Math.cos( ba - ( WEDGE_ANGLE / 2 ) ) * entitySize;
    var ry = Math.sin( ba - ( WEDGE_ANGLE / 2 ) ) * entitySize;

    // Find the curve control point
    var cx = Math.cos( ba ) * entitySize * 0.3;
    var cy = Math.sin( ba ) * entitySize * 0.3;

    // Color code entity based on food eaten compared to most successful
    var currentBest = this.population.entities[0].life.f;
    var r = currentBest == 0 ? 0 : Math.floor( ( 255 / currentBest ) * this.life.f );
    var b = ( 255 - r );
    var g = b;
    context.fillStyle = "rgb(" + r +  "," + g + "," + b + ")";
    context.strokeStyle = "#000";
    context.lineWidth = 2;

    // Draw the triangle
    context.shadow('rgba(0,0,0,0.5)', 2, 1, 1);
    context.beginPath();
        context.moveTo( e.x, e.y );
        context.lineTo( e.x + lx, e.y + ly );
        context.quadraticCurveTo( e.x + cx, e.y + cy, e.x + rx, e.y + ry );
    context.closePath();
    context.stroke();
    context.shadow();
    context.fill();

    this.wallDistance();
}

Entity.prototype.eat = function( foodSupply ) {
    for ( i in foodSupply.food ) {
        var f = foodSupply.food[ i ];

        // Use formula for a circle to find food
        var x2 = ( this.position.x - f.x ); x2 *= x2;
        var y2 = ( this.position.y - f.y ); y2 *= y2;
        var s2 = f.s + 2; s2 *= s2;

        // If we are within the circle, eat it
        if (  x2 + y2 < s2 ) {
            // Increase entities total eaten counter
            this.life.f++;

            // Increment global eaten counter
            eaten++;

            // Decrease the size of the eaten food
            f.s--;

            // Replace the food if it's exhausted
            if ( f.s <= MIN_FOOD_SIZE ) {
                foodSupply.food[ i ] = new Food();
            }
            this.life.h = 0;
            return true;
        }
    }
    this.life.h += 1 + ( this.output.ov * ENERGY_COST );
    return false;
}

Entity.prototype.wallDistance = function() {
    var e = this.position;
    // Adjacent will distance to top wall if facing it
    if ( e.a > Math.PI ) {
        var adj = e.y;
        var angle = e.a - ( Math.PI * 1.5 );

    // Otherwise adjacent will be distance to bottom wall
    } else {
        var adj = canvas.height - e.y;
        var angle = ( Math.PI * 0.5 ) - e.a;
    }

    // Find the opposite side
    var opp = ( Math.tan( angle ) * adj );

    // If the intersection point is within the canvas width
    // Find and return hypoteneuse
    if ( opp + e.x > 0 && opp + e.x < canvas.width ) {
        var hyp = Math.sec( angle ) * adj;

        // If farther than view distance, use view distance
        if ( hyp > VIEW_DISTANCE ) {
            hyp = VIEW_DISTANCE;
        }
        return hyp;
    }

    // Adjacent will be distance to right wall if facing it
    if ( e.a > Math.PI * 1.5 || e.a < Math.PI * 0.5 ) {
        var adj = canvas.width - e.x;
        if ( e.a > Math.PI > Math.PI * 1.5 ) {
            angle = e.a - ( 2 * Math.PI );
        } else {
            angle = e.a;
        }

    // Otherwise adjacent will be distance to left wall
    } else {
        var adj = e.x;
        angle = Math.PI - e.a;
    }

    // Find the hypoteneuse
    var hyp = Math.sec( angle ) * adj;

    // If farther than view distance, use view distance
    if ( hyp > VIEW_DISTANCE ) {
        hyp = VIEW_DISTANCE;
    }
    return hyp;
}

//                                                                                     GENE AND GENOME CLASSES
// ===========================================================================================================

function Gene( source ) {
    // definitions: t = threshold, r = relaxation, a = axons, a.s = strength, a.x = target coordinate

    // Gene's axon array
    this.a = [];

    // Create random gene if not given a source
    if ( typeof ( source ) == 'undefined' ) {

        var axonCount = Math.floor( Math.random() * MAX_AXONS ) + 1;
        //var axonCount = MAX_AXONS;
        for ( var i = 0; i < axonCount; i++ ) {
            this.a.push({
                 x: Math.floor( Math.random() * NEURONS_PER_LAYER ).fix()
                ,s: ( MAX_STRENGTH - ( Math.random() * MAX_STRENGTH * 2 ) ).fix()
            });
        }
        this.t = ( ( ( MAX_TRIGGER - MIN_TRIGGER ) * Math.random() ) + MIN_TRIGGER ).fix();
        this.r = ( 1 - ( Math.random() * ( MAX_RELAXATION / 100 ) ) ).fix();

    } else {

        // Copy from source if given one
        for ( i in source.a ) {
            var a = source.a[i];
            this.a.push({ x: a.x, s: a.s });
        }
        this.t = source.t;
        this.r = source.r;

    }
}

Gene.prototype.mutate = function() {
    mutationCount++;

    // Create an object containing random mutations for all possible parameters
    var mutations = {
         x: Math.floor( Math.random() * NEURONS_PER_LAYER )
        ,s: ( Math.random() * MUTATION_DELTA * 2 ) - MUTATION_DELTA
        ,t: ( Math.random() * MUTATION_DELTA * 2 ) - MUTATION_DELTA
        ,e: ( Math.random() * MUTATION_DELTA * 2 ) - MUTATION_DELTA
        ,r: ( ( Math.random() * MUTATION_DELTA * 2 ) - MUTATION_DELTA ) * 0.1
    }

    // Because our mutation engine tweaks values rather than replacing them,
    // we need to prevent the tweaks from exceeding configured limits
    function enforceBounds( boundType, val ) {
        var bounds = {
             's': { u: MAX_STRENGTH, l: -1 * MAX_STRENGTH }
            ,'t': { u: MAX_TRIGGER, l: 0 }
            ,'e': { u: 0, l: 0 }
            ,'r': { u: 1, l: 1 - ( MAX_RELAXATION / 100 ) }
        }
        if ( val > bounds[ boundType ].u ) val = bounds[ boundType ].u;
        else if ( val < bounds[ boundType ].l ) val = bounds[ boundType].l;
        return val;
    }

    axonCount = this.a.length;

    // 5% chance of an entirely new gene
    if ( Math.random() * 20 <= 1 ) {
        return( new Gene() );

    // 10% chance of adding axon
    } else if ( axonCount < MAX_AXONS && Math.random() * 10 <= 1 ) {
        this.a.push({
             x: Math.floor( Math.random() * NEURONS_PER_LAYER )
            ,s: ( MAX_STRENGTH - ( Math.random() * MAX_STRENGTH * 2 ) ).fix()
        });
        //console.log( 'Added axon' );

    // 10% chance of removing axon
    } else if ( axonCount > 1 && Math.random() * 10 <= 1 ) {
        delete this.a[ Math.floor( Math.random() * axonCount ) ];
        //console.log( 'Deleted axon' );

    // Otherwise mutate what we have
    } else {
        var AXON_PROPERTIES = 2;
        var BASE_PROPERTIES = 2;
        var possibleChanges = ( axonCount * AXON_PROPERTIES ) + BASE_PROPERTIES;
        var randChange = Math.floor( possibleChanges * Math.random() );
        if ( randChange > BASE_PROPERTIES - 1 ) {
            randChange -= BASE_PROPERTIES;
            axonIndex = randChange % axonCount;
            var axon = this.a[ axonIndex ];
            var type = [ 'x', 's' ][Math.floor( Math.random() * AXON_PROPERTIES )];
            if ( type == 's' ) {
                axon[ type ] += mutations[ type ];
                axon[ type ] = enforceBounds( type, axon[ type ] ).fix();
                //console.log( 'Axon strength change', axon[ type ] );
            } else {
                axon[ type ] = mutations[ type ];
                //console.log( 'Changing axon connection point', mutations[ type ] );
            }
        } else {
            var index = randChange;
            var type = [ 't', 'r' ][ index ];
            this[ type ] += mutations[ type ];
            this[ type ] = enforceBounds( type, this[ type ] ).fix();
            //console.log( 'Adjusting neuron', type, this[ type ] );
        }
    }
}

function Genome( source ) {
    // Gene array
    this.genes = [];

    // Loop through genome size, either creating or copying genes as needed
    for ( i = 0; i < MAX_NET_LAYERS * NEURONS_PER_LAYER; i++ ) {
        var newGene;
        if ( typeof( source ) == 'undefined' ) {
            newGene = new Gene();
        } else {
            newGene = new Gene( source.genes[ i ] );
        }
        this.genes.push( newGene );
    }
}

Genome.prototype.mutate = function() {
    var num = Math.floor( MUTATION_RATE * Math.random() );
    for ( i = 0; i < num; i++ ) {
        index = Math.floor( Math.random() * this.genes.length );
        this.genes[ index ].mutate();
    }
}

//                                                                                 FOOD AND FOODSUPPLY CLASSES
// ===========================================================================================================

function FoodSupply() {
    this.food = [];

    for ( var i = 0; i < FOOD_COUNT; i++ ) {
        this.food.push( new Food() );
    }
}

FoodSupply.prototype.draw = function() {
    for ( i in this.food ) {
        var food = this.food[i];
        if ( food.x > canvas.width || food.y > canvas.height ) {
            this.food[i] = new Food();
        }
        this.food[i].draw();
    }
}

function Food() {
    var BORDER = 20;
    this.x = BORDER + ( ( canvas.width - ( BORDER * 2 ) )  * Math.random() );
    this.y = BORDER + ( ( canvas.height - ( BORDER * 2 ) )  * Math.random() );
    this.s = MIN_FOOD_SIZE + ( ( MAX_FOOD_SIZE - MIN_FOOD_SIZE ) * Math.random() );
}

Food.prototype.draw = function() {

    if ( this.s != this.oldS ) {
        this.oldS = this.s;
        this.fillFood = context.createRadialGradient( this.x - 2, this.y - 2, 0, this.x, this.y, this.s );
        this.fillFood.addColorStop( 0, "rgba( 255, 204, 48, 0.9 )" );
        this.fillFood.addColorStop( 1, "rgba( 153, 102,  0, 0.9 )" );
    }

    context.beginPath();
        context.lineWidth = 3;
        context.strokeStyle = "#000";
        context.fillStyle = this.fillFood;

        context.arc( this.x, this.y, this.s, 0, Math.PI*2, true );

        context.shadow( "rgba( 0, 0, 0, 0.5 )", 2, 1 , 1 );
        context.stroke();
        context.shadow();

        context.fill();
    context.closePath();
}

//                                                                                       INFOGRAPHIC FUNCTIONS
// ===========================================================================================================

// Draw counters
function drawCounters() {
    // Draw the timer and born count

    // Get elapsed time in seconds
    var time = Math.floor( ( new Date( ( new Date()).getTime() - startTime.getTime() ) ).getTime() / 1000 );
    /*
    h = newTime.getUTCHours() + newTime.get;
    h = h == 0 ? "" : h + ":";
    m = newTime.getMinutes();
    m = m == 0 && h == "" ? "" : leadZero( m ) + ":";
    s = leadZero( newTime.getSeconds() );
    */

    var h = Math.floor( time / 3600 );
    var m = Math.floor( ( time % 3600 ) / 60 )
    var s = time % 60;

    s = leadZero( s );
    m = m == 0 && h == 0 ? "" : leadZero( m ) + ":";
    h = h == 0 ? "" : h + ":";

    document.getElementById('time').innerHTML = h + m + s + "<br/>"
                                              + mutationCount + "/" + born + "<br/>"
                                              + population.entities[0].life.f + "/" + highScore;
}

function counterHover() {
    var element = document.getElementById('time');
    var MAX_OPACITY  = 1.0;
    var MIN_OPACITY  = 0.5;
    var OPACITY_STEP = 0.1;

    element.style.opacity = MIN_OPACITY;

    animHandler = function() {
        if ( element.opDirection == 'up' ) {
            if ( element.style.opacity < MAX_OPACITY ) {
                element.style.opacity = parseFloat( element.style.opacity ) + OPACITY_STEP;
            } else {
                clearInterval( element.opInterval );
                delete element.opInterval;
            }
        } else {
            if ( element.style.opacity > MIN_OPACITY ) {
                element.style.opacity = parseFloat( element.style.opacity ) - OPACITY_STEP;
            } else {
                clearInterval( element.opInterval );
                delete element.opInterval;
            }
        }
    };

    element.onmouseover = function() {
        if ( element.style.opacity < MAX_OPACITY ) {
            element.opDirection = 'up';
            if ( typeof( element.opInterval ) == 'undefined' ) {
                element.opInterval = setInterval( animHandler, 1 );
            }
        }
    }

    element.onmouseout = function() {
        if ( element.style.opacity > MIN_OPACITY ) {
            element.opDirection = 'down';
            if ( typeof( element.opInterval ) == 'undefined' ) {
                element.opInterval = setInterval( animHandler, 1 );
            }
        }
    }
}

// Print stats table
function printStats() {

    // Only run periodically
    if ( iteration % REPORTING_RATE == 0 ) {
        var statsTable = document.getElementById('stats-tbody');

        // Calculate averages
        var foodAverage = 0;
        var lifeAverage = 0;
        for ( i in population.entities ) {
            var e = population.entities[ i ];
            foodAverage += e.life.f;
            lifeAverage += e.life.l;
        }
        foodAverage /= population.entities.length;
        lifeAverage /= population.entities.length;
        lifeAverage = Math.floor( lifeAverage );

        // Keep track of time (for FPS)
        newTimeStamp = ( new Date() ).getTime() / 1000;

        // Add our new table row
        statsTable.insertBefore( tableRow([
             Math.floor( REPORTING_RATE / ( newTimeStamp - timeStamp ) )
            ,( ( foodAverage * 10000 ) / lifeAverage ).toFixed(2)
            ,foodAverage.toFixed(2)
            ,lifeAverage
            ,starved
            ,wandered
            ,natural
            ,eaten
            ,population.entities[0].life.f
        ]), statsTable.firstChild );

        // Reset counters
        starved = 0;
        wandered = 0;
        eaten = 0;
        natural = 0;

        // Record new timestamp
        timeStamp = newTimeStamp;
    }
}
function updateDiagram() {
    // Find the best ranking entity for the diagram
    var winner = population.entities[ 0 ];

    if ( winner !== updateDiagram.lastWinner ) {
        updateDiagram.lastWinner = winner;

        // Drawing parameters
        var BORDER = 20; // Border around diagram
        var SPREAD = 32; // Width of connection spread

        // Get canvas and context for diagram
        var dCanvas = document.getElementById('diagram');
        var dContext = dCanvas.getContext('2d');

        if ( ! updateDiagram.firstRun ) {
            dCanvas.x = [];
            dCanvas.y = [];
        }

        // Clear the drawing area
        dContext.clearRect( 0, 0, dCanvas.width, dCanvas.height );

        // Find brain dimensions
        var bh = winner.brain.length;
        var bw = winner.brain[0].length;

        // Find drawing area ( minus the borders )
        var drawAreaWidth = dCanvas.width - ( BORDER * 2 );
        var drawAreaHeight = dCanvas.height - ( BORDER * 2 );

        // Find the distance between nodes
        var distanceX = ( drawAreaWidth  - ( NODE_RADIUS * 2 ) )  / ( bw - 1 );
        var distanceY = ( drawAreaHeight - ( NODE_RADIUS * 2 ) )  / ( bh - 1 );

        // Loop through layers
        for ( i = 0; i < bh; i++ ) {
            // Find coordinates of node layer
            y = Math.floor( BORDER + NODE_RADIUS + ( i * distanceY ) );

            // If this is our first run through, register the coordinates
            // for the onmousemove handler
            if ( ! updateDiagram.firstRun ) {
                dCanvas.y[ i ] = y;
            }

            // Loop through nodes
            for ( j = 0; j < bw; j++ ) {
                // Find coordinates of node circle
                x = Math.floor( BORDER + NODE_RADIUS + ( j * distanceX ) );

                // If this is our first run through, register the coordinates
                // for the onmousemove handler
                if ( ! updateDiagram.firstRun && i == 0 ) {
                    dCanvas.x[ j ] = x;
                }

                // Draw axon connections if not last layer
                if ( i < bh - 1 ) {

                    // Calculate distance between axon end points
                    spreadDistance = SPREAD / winner.brain[i][j].a.length;

                    // Loop through axons
                    for ( k in winner.brain[i][j].a ) {
                        // Find our axon
                        var axon = winner.brain[i][j].a[k];

                        // Calculate coordinates of axon targets
                        ax = Math.floor( BORDER + NODE_RADIUS + ( axon.x * distanceX ) - ( SPREAD / 2 ) + ( spreadDistance * k ) );
                        ay = Math.floor( BORDER + NODE_RADIUS + ( ( i + 1 ) * distanceY ) );

                        // Size line width relative to axon strength
                        dContext.lineWidth = ( axon.s / MAX_STRENGTH ) * ( ( SPREAD / MAX_AXONS ) / 2 );

                        // Draw the axon
                        dContext.beginPath();
                            dContext.shadow( "#000", 4, 2 ,2 );

                            // Color codinbg ( green = excitory / red = inhibitory )
                            if ( axon.s > 0 ) dContext.strokeStyle = "#090";
                                else dContext.strokeStyle = "#900";

                            // Draw the line
                            dContext.moveTo( x, y );
                            dContext.lineTo( ax, ay );
                            dContext.stroke();
                            dContext.shadow();
                        dContext.closePath();
                    }
                }
                // Draw node with white outer border
                dContext.strokeStyle = "#fff";
                dContext.lineWidth = 2.2;

                // Use a blue radial grandient to give impression of 3D
                var gradient = dContext.createRadialGradient( x - 5, y - 5, NODE_RADIUS * 0.4, x, y, NODE_RADIUS );
                gradient.addColorStop( 0, "#269" );
                gradient.addColorStop( 1, "#036" );
                dContext.fillStyle = gradient;

                dContext.beginPath();
                    dContext.shadow( "#000", 4, 2 ,2 );
                    dContext.arc( x, y, NODE_RADIUS, 0, Math.PI*2, true );
                    dContext.stroke();
                    dContext.shadow();
                    dContext.fill();
                dContext.closePath();

                // Align text in node circle
                dContext.textAlign = "center";
                dContext.textBaseline = "middle";

                // White text with black shadow
                dContext.shadow( '#000', 4, 2, 2 );
                dContext.fillStyle = "#fff";

                // Draw threshold and relaxation rate
                dContext.fillText( winner.brain[i][j].t.toFixed(1), x, y - 6 );
                dContext.fillText( ( ( 1 - winner.brain[i][j].r ) * 100 ).toFixed(0) + "%", x, y + 6 );

                dContext.shadow();
            }
        }
    }
}

function setDiagramMouseHandlers() {
    var tipGrid = [];
    tipGrid[ 0 ] = [ 'Left angle of closest food',
                     'Proximity of the nearest food',
                     'Right angle of closest food',
                     'Proximity of the nearest wall' ];
    tipGrid[ MAX_NET_LAYERS - 1 ] = [ 'Left wheel',
                                      'Speed up',
                                      'Right wheel',
                                      'Slow down' ];
    var dCanvas = document.getElementById('diagram');
    var tip = document.getElementById('diagram-tip');
    var diagram = document.getElementById('diagram');

    diagram.onmousemove = function( e ) {
        tip.style.left  = '';
        tip.style.right = '';
        for ( i in dCanvas.x ) {
            var x = dCanvas.x[ i ];
            if ( e.offsetX > x - NODE_RADIUS && e.offsetX < x + NODE_RADIUS  ) {
                for ( j in dCanvas.y ) {
                    var y = dCanvas.y[ j ];
                    if ( e.offsetY > y - NODE_RADIUS && e.offsetY < y + NODE_RADIUS  ) {
                        if ( typeof( tipGrid[ j ] ) !== 'undefined' ) {
                            tipText = tipGrid[ j ][ i ];
                            if ( typeof( tipText ) !== 'undefined' ) {
                                tip.innerHTML = tipText;

                                var posY = e.offsetY + dCanvas.offsetTop  + 12;
                                if ( posY + tip.offsetHeight < diagram.offsetHeight ) {
                                    tip.style.top  = posY;
                                    tip.style.bottom = '';
                                } else {
                                    tip.style.bottom = document.height - posY + 24;
                                    tip.style.top = '';
                                }

                                var posX = e.offsetX + dCanvas.offsetLeft + 12;
                                tip.style.right = '';
                                tip.style.left = 0;
                                if ( posX + tip.offsetWidth < document.width ) {
                                    tip.style.left = posX;
                                } else {
                                    tip.style.left = '';
                                    tip.style.right = document.width - posX + 24;
                                }
                                tip.style.visibility = 'visible';
                            }
                        }
                        return;
                    }
                }
                break;
            }
        }
        tip.style.visibility = 'hidden';
    }
    diagram.onmouseout = function( e ) {
        tip.style.visibility = 'hidden';
        tip.style.left = '';
        tip.style.right = '';
    }

}

function updateGraph() {
    if ( iteration % 33 == 0 ) {
        // Drawing parameters
        var BORDER = 20;

        var current = population.entities[0].life.f;

        // Get canvas and context for graph
        var gCanvas = document.getElementById('graph');
        var gContext = gCanvas.getContext('2d');

        // Record current best
        historyList.push({
            'mostEaten': current
        });

        // Trim historyList
        var historyLength = gCanvas.width - ( BORDER * 2 );
        if ( historyList.length > historyLength ) historyList.shift();

        // Update high score and low score
        if ( current > highScore ) highScore = current;
        if ( current < lowScore )  lowScore  = current;

        // Clear the graph canvas
        gContext.clearRect( 0, 0, gCanvas.width, gCanvas.height );

        // Find drawing area dimensions
        var drawAreaWidth  = gCanvas.width  - ( BORDER * 2 );
        var drawAreaHeight = gCanvas.height - ( BORDER * 2 );

        // Find distance between plots and vertical scaling facter
        var distanceX = historyList.length == 0 ? 1 : drawAreaWidth / ( historyList.length - 1 );
        var yRange = ( highScore - lowScore );
        var yScale = yRange == 0 ? 0 : drawAreaHeight / yRange;

        // Find starting point of graph
        var x = 0;
        var y = 0;

        // Draw 2 pixel wide white line with black shadow
        gContext.strokeStyle = "#fff";
        gContext.lineWidth = 2;
        gContext.shadow( '#000', 4, 2, 2 );

        // Draw the graph line
        gContext.beginPath();
            var newLowScore = highScore;
            for ( i in historyList ) {
                var currentPoint = historyList[i].mostEaten;

                // Record old x,y
                ox = x;
                oy = y;

                // Find new x,y
                x = BORDER + ( i * distanceX );
                y = gCanvas.height - ( BORDER + ( ( currentPoint - lowScore ) * yScale ) );

                // Find lowest score
                if ( currentPoint < newLowScore ) newLowScore = currentPoint;

                // Break out on first loop through, we only want to find starting point
                if ( i == 0 ) continue;

                // Add line segment
                gContext.moveTo( ox, oy );
                gContext.lineTo( x, y );
            }
            lowScore = newLowScore;
            gContext.stroke();
        gContext.closePath();
    }
}

//                                                                                     MISCELLANEOUS FUNCTIONS
// ===========================================================================================================

window.onresize = function( event ) {
    canvas.width = window.innerWidth - 384;
    canvas.height = window.innerHeight - 192;
    document.getElementById('graph').height = window.innerHeight - 192 - 384;
}

function tableRow( items ) {
    var row = document.createElement('tr');
    for ( i in items ) {
        var cell = document.createElement('td');
        cell.innerHTML = items[ i ];
        row.appendChild( cell );
    }
    return row;
}

function leadZero( v ) {
    return ( v < 10 ? "0" : "" ) + v;
}

function detectBrowser() {
    if ( /Firefox/.test( navigator.userAgent ) ) {
        return "firefox";
    } else if ( /Chrome/.test( navigator.userAgent ) ) {
        return "chrome";
    } else {
        return "other";
    }
}

if ( detectBrowser() == 'chrome' && SHADOWS ) {

    CanvasRenderingContext2D.prototype.shadow = function( color, xOffset, yOffset, blurRadius ) {

        if ( typeof( color ) == 'undefined' ) {
            this.shadowBlur = 0;
            this.shadowOffsetX = 0;
            this.shadowOffsetY = 0;
        } else {
            this.shadowColor = color;
            this.shadowBlur = blurRadius;
            this.shadowOffsetX = xOffset;
            this.shadowOffsetY = yOffset;
        }
    }

} else {
    CanvasRenderingContext2D.prototype.shadow = function( color, xOffset, yOffset, blurRadius ) {};
}

Math.sec = function( a ) {
    return ( 1 / Math.cos( a ) );
}

Number.prototype.fix = function( digits ) {
    if ( typeof( digits ) == 'undefined' ) digits = PRECISION;
    var factor = Math.pow( 10, digits );
    return Math.round( this * factor ) / factor;
}
