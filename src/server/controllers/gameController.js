//Imports the codewars Controller to make requests to/from the Code Wars API
var codewarsController = require('./codewarsController.js');
//Imports the sendTo function from socketRoutes
var sendTo = require('../api/socketRoutes.js').sendTo;
//Imports the constructor for a SolutionsQueue data structure
var fastQueue = require('../models/fastQueue.js');
//Imports the game model
var Game = require('../models/gameModel.js').Game;
//Imports model helper functions
var modelHelpers = require('../models/modelHelpers.js');

/*
 *  Custom queue data structure that will hold all dmid's generated from submitSolutions function
 */
var solutionsQueue = new fastQueue();

/*
 *  Interval between dmid queries to the Code Wars API
 *  ***DO NOT SET LOWER THAN 500***
 */
var apiPollInterval = 750;

//***************
//INNER FUNCTIONS
//***************

/*
 *  Resolves a solution attempt by dequeueing it and querying its dmid against the Code Wars API
 */
var resolveSolutionAttempt = function() {
  //peek first, in case the queued solution is not done processing on the Code Wars server
  var solutionAttempt = solutionsQueue.peek();
  if (solutionAttempt) {
    codewarsController.getSolutionResults(solutionAttempt.dmid)
      .then(function(data) {
        //If the solution is done processing
        if (data.valid === true || data.valid === false) {
          if (data.valid) {
            //emit 'challenge/winner' event to everyone in the game
            sendTo(solutionAttempt.gameId, 'challenge/winner', {
              winner: solutionAttempt.submittedBy
            });
          } else {
            //emit 'challenge/invalidSolution' event to origin of the solution
            sendTo(solutionAttempt.socketid, 'challenge/invalidSolution', data);
          }
          //remove the solution
          console.log(solutionAttempt.dmid + ' has been processed.');
          solutionsQueue.dequeue();
        } else {
          //solution is still processing
          console.log(solutionAttempt.dmid + ' is still processing.');
        }
      }, function(error) {
        throw error;
      });
  }
};
setInterval(resolveSolutionAttempt, apiPollInterval);

//****************
//HTTP CONTROLLERS
//****************

/*
 *  Generates a Game in database
 */
exports.createGame = function(req, res) {
  codewarsController.generateQuestion(req.body.difficulty)
    .then(function(data) {
      new Game({
        active: false,
        question: data.description,
        initialCode: data.session.setup,
        projectId: data.session.projectId,
        solutionId: data.session.solutionId,
        rank: data.rank
      }).save(function(error, createdGame) {
        if (error) {
          console.log('error saving new game in gameController.js');
          res.status(500).send(error);
        }
        res.send({
          gameId: createdGame.gameId
        });
      });

    }, function(error) {
      console.log('error generating question in gameController.js');
      res.status(500).send(error);
    });
};

//********************
//SOngCKET CONTROLLERS
//********************

/*
 *  Adds the specified user to the specified game, and sends a "challenge/start" event to all clients connected to the game
 */
exports.playerJoin = function(msg, socket) {
  //Connects the player to the gameId's socket room
  socket.join(msg.data.gameId); //TODO: implement separate socket rooms for chat,etc

  Game.findOne({
    gameId: msg.data.gameId
  }, function(error, foundGame) {
    if (error) {
      //If error on findOne... TODO: implement better error handling
      throw error;
    }
    if (foundGame) {
      foundGame.players.push(msg.data.userId);
      foundGame.save();
      //make game active if there are 2 or more players
      if (foundGame.players.length === 2) {
        foundGame.active = true;
        foundGame.save();
        sendTo(msg.data.gameId, 'challenge/gameStart', modelHelpers.buildGameObj(foundGame));
      }
    } else {
      //If foundGame is null... TODO: implement better error handling
      throw 'Game not found during playerJoin in gameController.js!';
    }
  });
};
/*
 *  Adds the specified user to the specified game, and sends a "challenge/start" event to all clients connected to the game
 */
exports.submitSolution = function(msg, socket) {
  Game.findOne({
    gameId: msg.data.gameId
  }, function(error, foundGame) {
    if (error) {
      //If error on findOne... TODO: implement better error handling
      throw error;
    }
    if (foundGame) {
      codewarsController.submitSolution(foundGame.solutionId, foundGame.projectId, msg.data.solution)
        .then(function(data) {
          if (data.success) {
            solutionsQueue.enqueue({
              dmid: data.dmid,
              gameId: msg.data.gameId,
              submittedBy: msg.data.userId,
              socketid: socket.id
            });
          } else {
            //If error submitting solution to codewars... TODO: implement better error handling
            throw err;
          }
        }, function(err) {
          //If error submitting solution... TODO: implement better error handling
          throw err;
        });
    } else {
      //If foundGame is null... TODO: implement better error handling
      throw 'Game not found during submitSolution in gameController.js!';
    }
  });
};
