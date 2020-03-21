import winston from 'winston';
import 'winston-mongodb';

const options = {
    fileInfo: {
        level: 'error',
        filename: `./logs/error.log`,
        handleExceptions: true,
        json: true,
        maxsize: 5242880, // 5MB
        maxFiles: 5,
        colorize: false,
        timestamp: true,
    },
    mongoDB: {
        db: 'mongodb://127.0.0.1:27017/movies_lib',
        collection: 'log',
        level: 'error',
        storeHost: true,
        capped: true,
    },
    console: {
        // format: winston.format.simple()
    }
};

const logger = winston.createLogger({
    format: winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss',
        }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(options.console),
        new winston.transports.MongoDB(options.mongoDB),
        new winston.transports.File(options.fileInfo)
    ],
});

logger.errorStream = {
    write: (message, encoding) => {
        logger.error(message);
        console.error(message);
    },
};

export default logger;

// const winston = require('winston');

// // require('winston-riak').Riak;
// // require('winston-mongo').Mongo;
// // require('winston-couchdb').Couchdb;

// // const logger = new (winston.Logger)({
// //     //   transports: [
// //     //     new winston.transports.Console(),
// //     //     new winston.transports.File({ filename: './all-logs.log' }),
// //     //     new winston.transports.Couchdb({ 'host': 'localhost', 'db': 'logs' }),
// //     //     new winston.transports.Riak({ bucket: 'logs' }),
// //     //     new winston.transports.MongoDB({ db: 'db', level: 'info'})
// //     //   ],
// //     //   exceptionHandlers: [
// //     //     new winston.transports.File({ filename: './exceptions.log' })
// //     //   ]
// //     transports: [
// //         new (winston.transports.Console)(),
// //         new (winston.transports.File)({ filename: 'movie-store.log' })
// //     ]
// // });

// winston.add(new winston.transports.File({ filename: 'logfile.log' }));
// winston.log('info', 'Hello distributed log files!');
// winston.info('Hello again distributed logs');

// // winston.add(winston.transports.File, { filename: 'movie-store.log' });
// // winston.remove(winston.transports.Console);
// const logger = winston;

// module.exports = logger;
