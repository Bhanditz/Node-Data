﻿/// <reference path="../typings/node/node.d.ts" />

//var Config1 = require('../repos');
var express = require('express');
import repo from './dynamic-repository';
var Reflect = require('reflect-metadata');
export var router = express.Router();

export class DynamicController {
    private repository: repo;
    private path: string;

    constructor(path: string, repository: repo) {
        this.repository = repository;
        this.path = path;
        this.addRoutes();
    }

    addRoutes() {
        router.get(this.path, (req, res) => {
            return this.repository.findAll()
                .then((result) => {
                    result=this.getHalModels(result,this.repository.modelName());
                    this.sendresult(req, res, result);
                    
                });
        });
        
        router.get(this.path + '/:id', (req, res) => {
            return this.repository.findOne(req.params.id)
                .then((result) => {
                    this.getHalModel1(result,this.repository.modelName(),this.repository.getEntityType());
                    this.sendresult(req, res, result);
                });
        });

        router.get(this.path + '/:id/:prop', (req, res) => {
            return this.repository.findChild(req.params.id, req.params.prop)
                .then((result) => {
                    //result=this.getHalModel1(result,this.repository.modelName(),this.repository.getEntityType());
                    //var propTypeName = Reflect.getMetadata("design:type", result.toObject()[req.params.prop], req.params.prop);
                    this.getHalModel1(result,this.repository.modelName(),this.repository.getEntityType());
                    
                    var parent=result.toObject();
                    var association=parent[req.params.prop];
                    //var propName=Reflect.getMetadata("design:type", association, req.params.prop);
                   // var resourceName= Reflect.getMetadata("design:type", association);
                    //this.getHalModel(association,req.params.prop);
                    this.sendresult(req, res,association );
                });
        });

        router.post(this.path, (req, res) => {
            this.getModelFromHalModel(req.body);
            return this.repository.post(req.body)
                .then((result) => {
                    this.sendresult(req, res, result);
                },(e) => {
                    console.log(e);
                });;
        });
        
        

        //router.post(this.path + '/:id/:prop/:value', (req, res) => {
        //    return this.sendresult(req, res, req.params);
        //});

        // delete any property value
        router.delete(this.path + "/:id/:prop", (req, res) => {
            return this.sendresult(req, res, req.params);
        });

        // add or update any property value
        router.put(this.path + "/:id", (req, res) => {
            return this.repository.put(req.params.id, req.body)
                .then((result) => {
                    this.sendresult(req, res, result);
                }, (e) => {
                    console.log(e);
                });
        });

        router.delete(this.path + "/:id", (req, res) => {
            return this.repository.delete(req.params.id)
                .then((result) => {
                    this.sendresult(req, res, result);
                });
        });

        router.patch(this.path + "/:id", (req, res) => {
            return this.repository.patch(req.params.id, req.body)
                .then((result) => {
                    this.sendresult(req, res, result);
                });
        });

    }

    private getHalModel(model:any,resourceName:string):any{
        var selfUrl={};
        selfUrl["href"]="/"+resourceName+"/"+model._id;
        var selfObjec={};
         selfObjec["self"]=selfUrl;      
        model["_links"]=selfObjec;
        
        return model;
    }
    
    private getModelFromHalModel(model:any)
    {
        if(model["_lniks"])
        {
            delete model["_lniks"];
        }
    }
    
     
    private getHalModel1(model:any,resourceName:string,resourceType:any):any{
        var dbModel=model._doc;
        var entityModel:any =new resourceType(dbModel);
        var selfUrl={};
        selfUrl["href"]="/"+resourceName+"/"+model._doc._id;
        //var selfObjec={};
        // selfObjec["self"]=selfUrl;      
        entityModel["_links"]["self"]=selfUrl;
        model._doc=entityModel;
        return model;
    }    
    
    
    private getHalModels(models: Array<any>,resourceName:string): any{
        var halresult={};
        halresult["_links"]={"self": { "href": "/"+resourceName},"search":{"href":"/search"}};
        models.forEach(model => {
            this.getHalModel(model,resourceName);
        });
        halresult["_embedded"]=models;
        return halresult;
    }

    private sendresult(req, res, result) {
        res.set("Content-Type", "application/json");
        
        res.send(JSON.stringify(result,null,4));
    }
}