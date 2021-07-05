const {BetContract} = require('smart_contract_mock');
const User = require("../models/User");
const Bet = require("../models/Bet");
const Event = require("../models/Event");

// Import User Service
const userService = require("../services/user-service");

const generator = require('generate-password');

const AdminBro = require('admin-bro');
const AdminBroExpress = require('@admin-bro/express');
const AdminBroMongoose = require('@admin-bro/mongoose')

AdminBro.registerAdapter(AdminBroMongoose);

let mongoose           = null;

exports.setMongoose = (newMongoose) => mongoose = newMongoose;

let adminBro = null;

exports.initialize = function () {
    adminBro = new AdminBro({
        databases: [mongoose],
        resources: [{
            resource: User,
            options: {
                listProperties: [
                    '_id',
                    'email',
                    'name',
                    'phone',
                    'profilePictureUrl',
                ]
            }
        }, {
            resource: Bet,
            options: {
                actions: {
                        resolve: {
                            // create a totally new action
                            actionType: 'record',
                            icon: 'Receipt',
                            isVisible: true,
                            handler: async (request, response, context) => {
                                const id = context.record.params._id;
                                const record = context.record;
                                record.params = await Bet.findById(id);
                                return {
                                    record: record.toJSON(),
                                }
                            },
                            component: AdminBro.bundle('./components/resolve'),
                        },
                        'do-resolve': {
                            // create a totally new action
                            actionType: 'record',
                            isVisible: false,
                            handler: async (request, response, context) => {
                                const id = context.record.params._id;
                                const bet = await Bet.findById(id);
                                const indexOutcome = request.fields.index;

                                const session = await Bet.startSession();
                                try {
                                    await session.withTransaction(async () => {
                                        context.record.params.message = 'The final outcome is ' + bet.outcomes[indexOutcome].marketQuestion;
                                        bet.finalOutcome = indexOutcome;
                                        await bet.save();

                                        const betContract = new BetContract(id);
                                        await betContract.resolveBet('Wallfair Admin User', indexOutcome);
                                    });
                                } finally {
                                    await session.endSession();
                                }
                                return {
                                    record: context.record.toJSON(context.currentAdmin),
                                }
                            },
                        },
                    },
            }
        }, Event],
        rootPath: '/admin',
        branding: {
            companyName: 'WALLFAIR',
        },
    });
}

exports.getRootPath = function () {
    return adminBro.options.rootPath;
}

exports.getLoginPath = function () {
    return adminBro.options.loginPath;
}
let router = null;
exports.buildRouter = function () {
    let password = generator.generate({
        length: 10,
        numbers: true
    });
    router = AdminBroExpress.buildAuthenticatedRouter(adminBro, {
        authenticate: async (email, password) => {
            const user = await User.findOne({ email });
            if (user) {
                if (await userService.comparePassword(user, password)) {
                    return user;
                }
            }
            return false;
        },
        cookiePassword: password,
    })
}

exports.getRouter = function () {
    return router;
}