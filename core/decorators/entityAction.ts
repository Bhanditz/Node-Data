import { MetaUtils } from "../metadata/utils";
import { Decorators } from '../constants/decorators';
import { ConstantKeys } from '../constants';
import { DecoratorType } from '../enums/decorator-type';
import { IPreauthorizeParams } from './interfaces/preauthorize-params';
import { PrincipalContext } from '../../security/auth/principalContext';
import { PreAuthService } from '../services/pre-auth-service';
import {PostFilterService} from '../services/post-filter-service';
import { pathRepoMap, getEntity, getModel } from '../dynamic/model-entity';
import { InstanceService } from '../services/instance-service';
import * as Utils from '../utils';
import { RepoActions } from '../enums/repo-actions-enum';
import {IDynamicRepository, DynamicRepository} from '../dynamic/dynamic-repository';
import * as Enumerable from 'linq';
import Q = require('q');
import { Types } from "mongoose";
import * as utils from '../../mongoose/utils';

/**
 * Provides you three states (new, old, merged) for an entity as parameters on which
 * one can build logic from original data in db and from new incoming JSON data
 */
export interface EntityActionParam {
    /**
 * This is a readOnly data ( don not change on it), used for comapring original input data JSON from client side.
 */
    inputEntity?: any;  // entity comes from client side (front end incoming JSON)

    /**
 * This is a readOnly data (don not change on it), used for comparing the original stored data on DB.
 */
    oldPersistentEntity?: any; // original entity stored on db
    /**
      * Any changes or modification can be done on newPersistentEntity which is final entity going to persist on the system.
    */
    newPersistentEntity?: any; // merged entity of inputEntity and oldPersistentEntity
}


export function entityAction(params: IPreauthorizeParams): any {
    params = params || <any>{};

    return function (target: Function, propertyKey: string, descriptor: any) {
        MetaUtils.addMetaData(target,
            {
                decorator: Decorators.PREAUTHORIZE,
                decoratorType: DecoratorType.METHOD,
                params: params,
                propertyKey: propertyKey
            });

        var originalMethod = descriptor.value;

        descriptor.value = function () {
            var anonymous = MetaUtils.getMetaData(target, Decorators.ALLOWANONYMOUS, propertyKey);
            if (anonymous) return originalMethod.call(this, ...arguments);
            let args = [];
            args = Array.apply(null, arguments);

            // merge logic
            return mergeTask.apply(this, [args, originalMethod]).then(fullyQualifiedEntities => {
                //if (originalMethod.name === RepoActions.findOne) {
                //    var ret = service.target[preAuthParam.methodName].apply(service.target, params);
                //}
                let findActions = [RepoActions.findAll, RepoActions.findByField, RepoActions.findChild, RepoActions.findMany,
                    RepoActions.findOne, RepoActions.findWhere];
                    // Converting Repo method names into uppercase as check with original method name is in uppercase.
                    // This is require othewise it will go in else condition and some of the entities will visible user without access e.g. questionnaire not assigned ot user.
                    findActions = findActions.map(methodName => methodName.toUpperCase());
                if (findActions.indexOf(originalMethod.name.toUpperCase()) >= 0) {
                    return PostFilterService.postFilter(fullyQualifiedEntities, params).then(result => {
                        if (!result) {
                            fullyQualifiedEntities = null;
                        }
                        if (result instanceof Array) {
                            let ids = result.map(x => x._id.toString());
                            // select only entities which have access
                            fullyQualifiedEntities = Enumerable.from(fullyQualifiedEntities).where((x: EntityActionParam) => ids.indexOf(x.newPersistentEntity._id.toString()) != -1).toArray();
                        }

                        if (args.length) {
                            args[args.length] = fullyQualifiedEntities;
                        }
                        else {
                            args[0] = fullyQualifiedEntities;
                        }
                        return originalMethod.call(this, ...args);
                    });
                }
                else {
                    return PreAuthService.isPreAuthenticated([fullyQualifiedEntities], params, propertyKey).then(isAllowed => {
                        //req.body = fullyQualifiedEntities;
                        if (isAllowed) {
                            // for delete, post action no need to save merged entity else save merged entity to db
                            //if (originalMethod.name.toUpperCase() != RepoActions.delete.toUpperCase()) {
                                if (args.length) {
                                    args[args.length] = fullyQualifiedEntities;
                                }
                                else {
                                    args[0] = fullyQualifiedEntities;
                                }
                            //}
                            return originalMethod.call(this, ...args);
                            //return originalMethod.apply(this, [fullyQualifiedEntities]);
                        }
                        else {
                            var error = 'unauthorize access for resource';
                            var res = PrincipalContext.get('res');
                            if (res) {
                                res.set("Content-Type", "application/json");
                                res.send(403, JSON.stringify(error, null, 4));
                            }
                            throw null;
                        }
                    });
                }
            });
        }
        return descriptor;
    }
}

function mergeTask(args: any, method: any): Q.Promise<any> {
    let prom: Q.Promise<any>;
    var response = [];
    let repo: IDynamicRepository = this;
    let rootRepo = repo.getRootRepo();
    switch (method.name.toUpperCase()) {

        case RepoActions.findOne.toUpperCase():
            prom = rootRepo.findOne(args[0], args[1]).then(res => {
                let mergedEntity = InstanceService.getInstance(this.getEntity(), null, res);
                return mergeProperties(res, undefined, mergedEntity);
            });
            break;
        case RepoActions.findAll.toUpperCase():
            prom = rootRepo.findAll().then((dbEntities: Array<any>) => {
                let mergedEntities = dbEntities.map(x => InstanceService.getInstance(this.getEntity(), null, x));
                return mergeEntities(dbEntities, undefined, mergedEntities);
            });
            break;
        case RepoActions.findWhere.toUpperCase():
            prom = rootRepo.findWhere.apply(rootRepo, args).then((dbEntities: Array<any>) => {
                let mergedEntities = dbEntities.map(x => InstanceService.getInstance(this.getEntity(), null, x));
                return mergeEntities(dbEntities, undefined, mergedEntities);
            });
            break;
        case RepoActions.findMany.toLocaleUpperCase():
            prom = rootRepo.findMany(args[0]).then((dbEntities: Array<any>) => {
                let mergedEntities = dbEntities.map(x => InstanceService.getInstance(this.getEntity(), null, x));
                return mergeEntities(dbEntities, undefined, mergedEntities);
            });
            break;
        // TODO: Need to write code for all remaining get entity(s) actions

        case RepoActions.post.toUpperCase():
            // do nothing
            let mergedEntity1 = InstanceService.getInstance(this.getEntity(), null, args[0]);
            prom = Q.when(mergeProperties(undefined, InstanceService.getInstance(this.getEntity(), null, args[0]), mergedEntity1));
            break;
        case RepoActions.put.toUpperCase():
        case RepoActions.patch.toUpperCase():
            // fetch single object
            let entityIdToUpdate = args[0];
            let entityToUpdate = args[1];
            entityToUpdate._id = entityIdToUpdate;
            let mergedEntity = InstanceService.getInstance(this.getEntity(), null, args[1]);
            prom = rootRepo.findOne(args[0]).then(res => {
                return mergeProperties(res, args[1], mergedEntity);
            });
            break;
        case RepoActions.delete.toUpperCase():
            // fetch single object 
            prom = rootRepo.findMany([args[0]], true).then(res => {
                return mergeProperties(res[0], args[0], res[0]);
            });
            break;

        case RepoActions.bulkPost.toUpperCase():
            args[0].forEach(x => {
                var mergedEntity1 = InstanceService.getInstance(this.getEntity(), null, x);
                response.push(mergeProperties(undefined, InstanceService.getInstance(this.getEntity(), null, x), mergedEntity1));
            });
            prom = Q.when(response);
            break;
        case RepoActions.bulkPut.toUpperCase():
            var ids = Enumerable.from(args[0]).select(x => x['_id'].toString()).toArray();
            let mergeEntities1 = [];
            console.log("entity action findmany instance service start " + this.path);
            args[0].forEach(x => {
                mergeEntities1.push(InstanceService.getInstance(this.getEntity(), null, x));
            });
            console.log("entity action findmany start " + this.path);
            prom = rootRepo.findMany(ids, true).then(dbEntities => {
                console.log("entity action merge entity start " + this.path);
                let retval = mergeEntities(dbEntities, args[0], mergeEntities1);
                console.log("entity action merge entity end " + this.path);
                return retval;
            });
            break;
        case RepoActions.bulkDel.toUpperCase():
            if (args[0].length > 0) {
                var ids = [];
                Enumerable.from(args[0]).forEach(x => {
                    if (Utils.isJSON(x)) {
                        ids.push(x['_id']);
                    }
                    else {
                        ids.push(x);
                    }
                });
                prom = rootRepo.findMany(ids).then(dbEntities => {
                    return mergeEntities(undefined, dbEntities, dbEntities);
                });
            }
            else {
                let mergeEntities1 = InstanceService.getInstance(this.getEntity(), null, args[0]);
                prom = Q.when(mergeProperties(args[0], undefined, mergeEntities1));
            }
            break;
        default:
            prom = Q.when(mergeProperties(args[0], undefined));
            break;
    }
    return prom.then(res => {
        // set fully loaded attribute to root element
        if (res instanceof Array) {
            res.forEach(x => {
                res[ConstantKeys.FullyLoaded] = true;
            });
        }
        else {
            res[ConstantKeys.FullyLoaded] = true;
        }
        return res;
    }).catch(exc => {
        console.log(exc);
        throw exc;
    });
}

function mergeEntities(dbEntities, entities?, mergeEntities1?: Array<any>) {
    var res = [];
    if (!entities && dbEntities) {
        dbEntities.forEach(x => {
            res.push(mergeProperties(x, undefined, x));
        });
        return res;
    }
    let dbEntityKeyVal = {};
    let megredEntityKeyVal = {};
    if (dbEntities) {
        dbEntities.forEach(dbE => dbEntityKeyVal[dbE._id] = dbE);
    }

    if (mergeEntities1) {
        mergeEntities1.forEach(mgE => megredEntityKeyVal[mgE._id] = mgE);
    }

    entities.forEach(entity => {

        var dbEntity, mergeEntity;
        if (dbEntities) {
            dbEntity = dbEntityKeyVal[entity['_id']];
        }
        if (mergeEntities1) {
            mergeEntity = megredEntityKeyVal[entity['_id']];
        }

        res.push(mergeProperties(dbEntity, entity, mergeEntity));

    });
    return res;
}

function mergeProperties(dbEntity?: any, entity?: any, mergedEntity?: any): EntityActionParam {
    if (!mergedEntity) {
        mergedEntity = <any>{};
    }

    let tempMergedEntity = <any>{};
    if (dbEntity) {
        for (var prop in dbEntity) {
            tempMergedEntity[prop] = dbEntity[prop];
        }

    }
    if (entity) {
        for (var prop in entity) {
            tempMergedEntity[prop] = entity[prop];
        }
    }
    if (!entity.isChild) {
        mergedEntity.__changedDataHolder = {};
        mergedEntity.__dataHolder = {};
    }

    if (tempMergedEntity && (tempMergedEntity instanceof Object && !(tempMergedEntity instanceof Types.ObjectId))) {

        for (var prop in tempMergedEntity) {
            if (!Array.isArray(tempMergedEntity[prop]) && typeof tempMergedEntity[prop] == "object" && typeof dbEntity[prop] == "object") {
                tempMergedEntity[prop].isChild = true;
                let newPropName = prop;
                if (tempMergedEntity.propName) {
                    newPropName = tempMergedEntity.propName + "." + prop;
                }
                tempMergedEntity[prop].propName = newPropName;
                mergedEntity[prop] = mergeProperties(mergedEntity[prop], tempMergedEntity[prop],
                    { __changedDataHolder: mergedEntity.__changedDataHolder, __dataHolder: mergedEntity.__dataHolder });
            }
            else {
                if (tempMergedEntity[prop] === undefined) {
                    delete mergedEntity[prop];
                }
                else {
                    mergedEntity[prop] = tempMergedEntity[prop];                
                }
                
                if (typeof tempMergedEntity[prop] == "object") {
                    mergedEntity.__changedDataHolder[prop] = mergedEntity[prop];
                }
            }
            let rootProp = undefined;
            if (entity.isChild) {
                rootProp = entity.propName;
            }
            
            fillDataHolder(prop, mergedEntity[prop], rootProp, mergedEntity.__dataHolder);
            subscribeGetterSetter(mergedEntity, prop, rootProp, mergedEntity.__dataHolder, mergedEntity.__changedDataHolder); // for new property add in model will not be subscribed its getter and setter            
        }
    }
    if (entity.isChild) {
        delete entity.isChild;
        delete entity.propName;
        delete mergedEntity.__changedDataHolder;
        delete mergedEntity.isChild;
        delete mergedEntity.propName;
        return mergedEntity;
    }

    mergedEntity[ConstantKeys.FullyLoaded] = true;
    return { inputEntity: entity, oldPersistentEntity: dbEntity, newPersistentEntity: mergedEntity };
}

function subscribeGetterSetter(modelObj: any, prop: any, propNameFullPath: any, dataHolder: any, changedDataHolder: any) {
    //if (!modelObj.__changedDataHolder) {
    //    modelObj.__changedDataHolder = {};
    //}
    Object.defineProperty(modelObj, prop, {
        get: function () {
            //return dataHolder[prop];
            return getDataFromDataHolder(prop, propNameFullPath, dataHolder);
        },
        set: function (new_value) {
            dataHolder[prop] = new_value;
            // set property for child element 
            if (propNameFullPath) {
                let qualifiedObj = nestedPropInstanceGenerator(changedDataHolder, propNameFullPath);
                qualifiedObj[prop] = new_value;
                //!changedDataHolder[propNameFullPath] && (changedDataHolder[propNameFullPath] = {})
                //changedDataHolder[propNameFullPath][prop] = new_value;
            }
            // set property for root element 
            else {
                changedDataHolder[prop] = new_value;
            }
        }
    });
}

/**
 * 
 * @param obj
 * @param path - comma separated string property names
 */
function nestedPropInstanceGenerator(obj: any, path: string) {
    if (!path) {
        return {};
    }
    let propArry = path.split(".");
    let tempRef = obj;
    propArry.forEach(prop => {
        let objRef = tempRef;
        tempRef = tempRef[prop];
        if (tempRef) {
            return;
        }
        tempRef = objRef[prop] = {};
    });

    return tempRef;


    //const set = (obj, path, val) => {
    //    const keys = path.split('.');
    //    const lastKey = keys.pop();
    //    const lastObj = keys.reduce((obj, key) =>
    //        obj[key] = obj[key] || {},
    //        obj);
    //    lastObj[lastKey] = val;
    //};
}

function nestedPropGetter(obj: any, path: string) {
    if (!path) {
        return {};
    }
    let propArry = path.split(".");
    let tempRef = obj;
    for (let i in propArry) {
        let prop = propArry[i];
        let objRef = tempRef;
        tempRef = tempRef[prop];
        if (!tempRef) {
            break;
        }
    }

    return tempRef;
}


function fillDataHolder(prop: any, value: any, propNameFullPath: any, dataHolder: any) {
    if (["isChild", "propName"].indexOf(prop) > -1) {
        return;
    }
    // set property for child element 
    if (propNameFullPath) {
        dataHolder[propNameFullPath + "." + prop] = value;
        //!changedDataHolder[propNameFullPath] && (changedDataHolder[propNameFullPath] = {})
        //changedDataHolder[propNameFullPath][prop] = new_value;
    }
    // set property for root element 
    else {
        dataHolder[prop] = value;
    }
}

function getDataFromDataHolder(prop: any, propNameFullPath: any, dataHolder: any) {
    if (propNameFullPath) {
        return dataHolder[propNameFullPath + "." + prop];
    }
    return dataHolder[prop];

}