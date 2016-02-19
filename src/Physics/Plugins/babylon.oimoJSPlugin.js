var BABYLON;
(function (BABYLON) {
    var OimoJSPlugin = (function () {
        function OimoJSPlugin(iterations) {
            this.name = "OimoJSPlugin";
            this._tmpImpostorsArray = [];
            this._tmpPositionVector = BABYLON.Vector3.Zero();
            this.world = new OIMO.World(null, null, iterations);
            this.world.clear();
        }
        OimoJSPlugin.prototype.setGravity = function (gravity) {
            this.world.gravity.copy(gravity);
        };
        OimoJSPlugin.prototype.executeStep = function (delta, impostors) {
            impostors.forEach(function (impostor) {
                impostor.beforeStep();
            });
            this.world.step();
            impostors.forEach(function (impostor) {
                impostor.afterStep();
                //update the ordered impostors array
                this._tmpImpostorsArray[impostor.mesh.uniqueId] = impostor;
            });
            //check for collisions
            var contact = this.world.contacts;
            while (contact !== null) {
                if (contact.touching && !contact.body1.sleeping && !contact.body2.sleeping) {
                    continue;
                }
                //is this body colliding with any other? get the impostor
                var mainImpostor = this._tmpImpostorsArray[+contact.body1.name];
                var collidingImpostor = this._tmpImpostorsArray[+contact.body2.name];
                if (!mainImpostor || !collidingImpostor)
                    continue;
                mainImpostor.onCollide({ body: collidingImpostor.physicsBody });
                collidingImpostor.onCollide({ body: mainImpostor.physicsBody });
                contact = contact.next;
            }
        };
        OimoJSPlugin.prototype.applyImpulse = function (impostor, force, contactPoint) {
            impostor.physicsBody.body.applyImpulse(contactPoint.scale(OIMO.INV_SCALE), force.scale(OIMO.INV_SCALE));
        };
        OimoJSPlugin.prototype.applyForce = function (impostor, force, contactPoint) {
            BABYLON.Tools.Warn("Oimo doesn't support applying force. Using impule instead.");
            this.applyImpulse(impostor, force, contactPoint);
        };
        OimoJSPlugin.prototype.generatePhysicsBody = function (impostor) {
            //parent-child relationship. Does this impostor has a parent impostor?
            if (impostor.parent) {
                if (impostor.physicsBody) {
                    this.removePhysicsBody(impostor);
                    //TODO is that needed?
                    impostor.forceUpdate();
                }
                return;
            }
            impostor.mesh.computeWorldMatrix(true);
            if (impostor.isBodyInitRequired()) {
                if (!impostor.mesh.rotationQuaternion) {
                    impostor.mesh.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(impostor.mesh.rotation.y, impostor.mesh.rotation.x, impostor.mesh.rotation.z);
                }
                var deltaPosition = impostor.mesh.position.subtract(impostor.mesh.getBoundingInfo().boundingBox.center);
                //calculate rotation to fit Oimo's needs (Euler...)
                var bodyConfig = {
                    name: impostor.mesh.uniqueId,
                    //pos: [bbox.center.x, bbox.center.y, bbox.center.z],
                    //rot: [rot.x / OIMO.TO_RAD, rot.y / OIMO.TO_RAD, rot.z / OIMO.TO_RAD],
                    config: [impostor.getParam("mass"), impostor.getParam("friction"), impostor.getParam("restitution")],
                    size: [],
                    type: [],
                    pos: [],
                    rot: []
                };
                var impostors = [impostor];
                function addToArray(parent) {
                    parent.getChildMeshes().forEach(function (m) {
                        if (m.physicImpostor) {
                            impostors.push(m.physicImpostor);
                        }
                    });
                }
                addToArray(impostor.mesh);
                impostors.forEach(function (i) {
                    //get the correct bounding box
                    var oldQuaternion = i.mesh.rotationQuaternion;
                    i.mesh.rotationQuaternion = new BABYLON.Quaternion(0, 0, 0, 1);
                    i.mesh.computeWorldMatrix(true);
                    var bbox = i.mesh.getBoundingInfo().boundingBox;
                    var rot = new OIMO.Euler().setFromQuaternion({ x: impostor.mesh.rotationQuaternion.x, y: impostor.mesh.rotationQuaternion.y, z: impostor.mesh.rotationQuaternion.z, s: impostor.mesh.rotationQuaternion.w });
                    if (i === impostor) {
                        //Can also use Array.prototype.push.apply
                        bodyConfig.pos.push(bbox.center.x);
                        bodyConfig.pos.push(bbox.center.y);
                        bodyConfig.pos.push(bbox.center.z);
                    }
                    else {
                        bodyConfig.pos.push(i.mesh.position.x);
                        bodyConfig.pos.push(i.mesh.position.y);
                        bodyConfig.pos.push(i.mesh.position.z);
                    }
                    bodyConfig.rot.push(rot.x / OIMO.TO_RAD);
                    bodyConfig.rot.push(rot.y / OIMO.TO_RAD);
                    bodyConfig.rot.push(rot.z / OIMO.TO_RAD);
                    // register mesh
                    switch (i.type) {
                        case BABYLON.PhysicsEngine.SphereImpostor:
                            var radiusX = bbox.maximumWorld.x - bbox.minimumWorld.x;
                            var radiusY = bbox.maximumWorld.y - bbox.minimumWorld.y;
                            var radiusZ = bbox.maximumWorld.z - bbox.minimumWorld.z;
                            var size = Math.max(this._checkWithEpsilon(radiusX), this._checkWithEpsilon(radiusY), this._checkWithEpsilon(radiusZ)) / 2;
                            bodyConfig.type.push('sphere');
                            //due to the way oimo works with compounds, add 3 times
                            bodyConfig.size.push(size);
                            bodyConfig.size.push(size);
                            bodyConfig.size.push(size);
                            break;
                        case BABYLON.PhysicsEngine.PlaneImpostor:
                        //TODO Oimo now supports cylinder!
                        case BABYLON.PhysicsEngine.CylinderImpostor:
                        case BABYLON.PhysicsEngine.BoxImpostor:
                            var min = bbox.minimumWorld;
                            var max = bbox.maximumWorld;
                            var box = max.subtract(min);
                            var sizeX = this._checkWithEpsilon(box.x);
                            var sizeY = this._checkWithEpsilon(box.y);
                            var sizeZ = this._checkWithEpsilon(box.z);
                            bodyConfig.type.push('box');
                            bodyConfig.size.push(sizeX);
                            bodyConfig.size.push(sizeY);
                            bodyConfig.size.push(sizeZ);
                            break;
                    }
                    //actually not needed, but hey...
                    i.mesh.rotationQuaternion = oldQuaternion;
                });
                impostor.physicsBody = this.world.add(bodyConfig);
                impostor.setDeltaPosition(deltaPosition);
            }
            else {
                this._tmpPositionVector.copyFromFloats(0, 0, 0);
            }
            this._tmpPositionVector.addInPlace(impostor.mesh.getBoundingInfo().boundingBox.center);
            this.setPhysicsBodyTransformation(impostor, this._tmpPositionVector, impostor.mesh.rotationQuaternion);
        };
        OimoJSPlugin.prototype._checkWithEpsilon = function (value) {
            return value < BABYLON.PhysicsEngine.Epsilon ? BABYLON.PhysicsEngine.Epsilon : value;
        };
        OimoJSPlugin.prototype.removePhysicsBody = function (impostor) {
            this.world.removeRigidBody(impostor.physicsBody);
        };
        OimoJSPlugin.prototype.generateJoint = function (impostorJoint) {
            var mainBody = impostorJoint.mainImpostor.physicsBody;
            var connectedBody = impostorJoint.connectedImpostor.physicsBody;
            if (!mainBody || !connectedBody) {
                return;
            }
            var jointData = impostorJoint.joint.jointData;
            var options = jointData.nativeParams || {};
            var type;
            switch (impostorJoint.joint.type) {
                case BABYLON.PhysicsJoint.BallAndSocketJoint:
                    type = "jointBall";
                    break;
                case BABYLON.PhysicsJoint.DistanceJoint:
                    type = "jointDistance";
                    break;
                case BABYLON.PhysicsJoint.PrismaticJoint:
                    type = "jointPrisme";
                    break;
                case BABYLON.PhysicsJoint.SliderJoint:
                    type = "jointSlide";
                    break;
                case BABYLON.PhysicsJoint.WheelJoint:
                    type = "jointWheel";
                    break;
                case BABYLON.PhysicsJoint.HingeJoint:
                default:
                    type = "jointHinge";
                    break;
            }
            impostorJoint.joint.physicsJoint = this.world.add({
                type: type,
                body1: mainBody.body,
                body2: connectedBody.body,
                min: options.min,
                max: options.max,
                axe1: jointData.mainAxis ? jointData.mainAxis.asArray() : null,
                axe2: jointData.connectedAxis ? jointData.connectedAxis.asArray() : null,
                pos1: jointData.mainPivot ? jointData.mainPivot.asArray() : null,
                pos2: jointData.connectedPivot ? jointData.connectedPivot.asArray() : null,
                collision: options.collision,
                spring: options.spring
            });
        };
        OimoJSPlugin.prototype.removeJoint = function (joint) {
            //TODO
        };
        OimoJSPlugin.prototype.isSupported = function () {
            return OIMO !== undefined;
        };
        OimoJSPlugin.prototype.setTransformationFromPhysicsBody = function (impostor) {
            if (!impostor.physicsBody.sleeping) {
                //TODO check that
                if (impostor.physicsBody.shapes.next) {
                    var parentShape = this._getLastShape(impostor.physicsBody);
                    impostor.mesh.position.x = parentShape.position.x * OIMO.WORLD_SCALE;
                    impostor.mesh.position.y = parentShape.position.y * OIMO.WORLD_SCALE;
                    impostor.mesh.position.z = parentShape.position.z * OIMO.WORLD_SCALE;
                }
                else {
                    impostor.mesh.position.copyFrom(impostor.physicsBody.getPosition());
                }
                impostor.mesh.rotationQuaternion.copyFrom(impostor.physicsBody.getQuaternion());
            }
        };
        OimoJSPlugin.prototype.setPhysicsBodyTransformation = function (impostor, newPosition, newRotation) {
            var body = impostor.physicsBody;
            body.setPosition(newPosition);
            body.setQuaternion(newRotation);
            body.sleeping = false;
            //force Oimo to update the body's position
            body.updatePosition(1);
        };
        OimoJSPlugin.prototype._getLastShape = function (body) {
            var lastShape = body.shapes;
            while (lastShape.next) {
                lastShape = lastShape.next;
            }
            return lastShape;
        };
        OimoJSPlugin.prototype.dispose = function () {
            this.world.clear();
        };
        return OimoJSPlugin;
    }());
    BABYLON.OimoJSPlugin = OimoJSPlugin;
})(BABYLON || (BABYLON = {}));
