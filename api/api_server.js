import express from 'express'
import path from 'path'
import cors from 'cors'
import cardsJSON from './data/cards.json'
import MongoClient from 'mongodb'
import * as socketIO from 'socket.io'
import http from 'http'
import createGameServer from './game_management.js'

/* 
 * This module creates an Express.JS instance.
 * Handles the API end points for all the resources
 * that the client needs to fetch from the server, 
 * such as the images of all the cards.
 */


// Create the express instance and attatch it to the http server
const APP = express()
const HTTP = http.Server(APP)

// Create the MongoDB client. 
const URL = 'mongodb://localhost:27017'

// We need to use CORS. As the front-end API is located
// at a different endpoint.
APP.use(cors())

// Need to use the JSON module for express so we can easily
// convert client JSON request to objects.
APP.use(express.json())

/*
 * Creates the instance of the SocketIO server.
 * 
 * We need to allow credentials as the Vue Client Side
 * library uses credentials.
 * 
 * At the minute the origin is only for localhost:8080 but this is
 * likely to change.
 * 
 * Need to specify the transport methods to use. VueJS won't connect 
 * if you do not do this.
 * 
 * Set the pingInterval to slightly higher. A problem occurred when it 
 * was too low.
 */
const io = new socketIO.Server(HTTP, {
  cors: {
    origin: 'http://localhost:8080',
    credentials: true,
    methods: ['GET', 'POST'],
    transports: ['websocket', 'polling'],
  },
  allowEIO3: true,
  pingInterval: 10000
});

const __dirname = path.resolve()

// Sets up the card endpoint. This simply allows the user to retrive the images of the cads.
APP.use('/card', express.static(path.join(__dirname, './assets/cards')))

/*
 * Returns all of the cards in a JSON format.
 */
APP.get('/cards', (req, res) => {
  res.header('Content-Type', 'application/json')
  res.json(cardsJSON)
})

/*
 * Allows the user to to upload a 
 * deck to the server.  
 */
APP.post('/deck', (req, res) => {
  add_deck (req.body)
    .then (_ => res.sendStatus(200))
    .catch (err => {
      console.log(err)
      res.sendStatus(500)
    }) 
})

/*
 * Allows the user to retrieve a list
 * of all the decks uploaded to the server.
 */
APP.get('/decks', (req, res) => {
  get_decks()
    .then(decks => res.json(decks))
    .catch(_ => res.sendStatus(500))  // TODO: In detail error.
})

/* 
 * Sets up all the SocketIO events for the game
 * to take place.
 */
createGameServer(io)

// Use the PORT as specified by the process or default to 3000
const PORT = process.env.PORT || 3000

HTTP.listen(PORT, () => {
  console.log(`LISTENING ON PORT ${PORT}`)
})

let db = null

/*
 * Set up the connection to the MongoDB database.
 */
setup_database()
  .then(_ => console.log(`DB CONNECTED`))
  .catch(err => console.log(err));


/**
 * Sets up the connection to the MongoDB database.
 */
async function setup_database () {
  return MongoClient.connect (URL, (err, dbObj) => {
    if (err) throw err

    db = dbObj.db('RingOfFire')
  })
}

/**
 * Adds a deck to the database.
 * 
 * @param {Object} deckToAdd       the deck to add to the database
 */
async function add_deck (deckToAdd) {
  
  if (db == null) {
    throw new Error("the database is not setup")
  }

  return await db.collection("Decks").insertOne(deckToAdd)
}

/**
 * Retrieves all the decks from the MongoDB database.
 */
async function get_decks () {
  if (db == null) {
    throw new Error("the database is not setup")
  }

  return await db.collection("Decks").find({}).toArray()
}

