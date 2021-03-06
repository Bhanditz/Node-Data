import {MetaUtils} from "../../core/metadata/utils";
import {DecoratorType} from '../../core/enums/decorator-type';
import {Decorators} from '../constants';
import * as Sequelize from "sequelize";

export function column(params?: {name:string,
    type?: any, allowNull?: boolean,
    primaryKey?:boolean,unique?:boolean,validate?:any, autogenerated?: boolean, searchIndex?: boolean,autoIncrement? : boolean
}) {
    return function (target: Object, propertyKey: string) {
        console.log('field - propertyKey: ', propertyKey, ', target:', target);
        MetaUtils.addMetaData(target,
            {
                decorator: Decorators.COLUMN,
                decoratorType: DecoratorType.PROPERTY,
                params: params,
                propertyKey: propertyKey
            });
    }
}